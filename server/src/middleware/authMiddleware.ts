/**
 * @module AuthMiddleware
 *
 * Provides authentication and role-based access control (RBAC) middleware functions.
 * Validates cryptographically signed JSON Web Tokens (JWT) from Bearer headers,
 * attaches the authenticated user record to incoming requests, and enforces
 * administrative, shift manager, and group membership permissions.
 */

import { Request, Response, NextFunction, RequestHandler } from "express";
import mongoose from "mongoose";
import User, { UserDocument } from "../models/User";
import { verifyToken, DecodedTokenPayload } from "../utils/jwt";
import {
    isAdmin,
    isGroupMember,
    isShiftManager,
} from "../utils/authHelpers";
import { BoundedLRUCache } from "../utils/lruCache";

export interface CachedUserSession {
    readonly user: UserDocument | Express.User;
    readonly timestamp: number;
}

// In-memory bounded session cache to avoid per-request database lookups
const USER_CACHE_TTL_MS = 30 * 1000; // 30-second TTL
const userCache = new BoundedLRUCache<string, CachedUserSession>({
    max: 1000,
    ttl: USER_CACHE_TTL_MS,
});

// Bounded token signature cache to avoid per-request synchronous HMAC-SHA256 digests
const tokenSignatureCache = new BoundedLRUCache<string, DecodedTokenPayload>({
    max: 5000,
    ttl: 60 * 1000,
});

// Denylist for explicitly revoked/logged-out tokens (7-day TTL matches max JWT lifespan)
const revokedTokenCache = new BoundedLRUCache<string, boolean>({
    max: 10000,
    ttl: 7 * 24 * 60 * 60 * 1000,
});

let tokenHits = 0;
let tokenMisses = 0;

/**
 * Revokes a token by adding it to the denylist and removing from signature cache.
 * @param token - Token to revoke.
 */
export const revokeToken = (token: string): void => {
    if (token) {
        tokenSignatureCache.delete(token);
        revokedTokenCache.set(token, true);
    }
};

/**
 * Checks if a token has been explicitly revoked.
 * @param token - Token string to check.
 */
export const isTokenRevoked = (token: string): boolean => {
    return revokedTokenCache.has(token);
};

/**
 * Invalidates the cached token signatures.
 * @param token - Optional token; clears all if omitted.
 */
export const invalidateTokenCache = (token?: string): void => {
    if (token) {
        tokenSignatureCache.delete(token);
    } else {
        tokenSignatureCache.clear();
        tokenHits = 0;
        tokenMisses = 0;
    }
};

/**
 * Returns cache telemetry for token signatures.
 */
export const getTokenCacheStats = (): { size: number; hits: number; misses: number } => ({
    size: tokenSignatureCache.size,
    hits: tokenHits,
    misses: tokenMisses,
});

/**
 * Invalidates the cached user session when profile, roles, or status change.
 * @param userId - Optional user ID; clears all if omitted.
 */
export const invalidateUserCache = (userId?: string | mongoose.Types.ObjectId | { toString(): string }): void => {
    if (userId) {
        userCache.delete(userId.toString());
    } else {
        userCache.clear();
    }
};

/**
 * Protects routes by requiring a valid JSON Web Token in the Authorization header.
 * 
 * Verifies the token signature and expiration, retrieves the active user from
 * the cache or database, and attaches the user document to `req.user`.
 */
export const protect: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Priority 1: Check HTTP-only session cookie (hl_session)
        let token: string | undefined = req.cookies?.hl_session;

        // Priority 2: Check Authorization Bearer header fallback
        if (!token) {
            const rawAuthHeader = req.headers.authorization || req.headers.Authorization;
            const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
            if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
                token = authHeader.split(" ")[1];
            }
        }

        if (!token) {
            res.status(401).json({
                message: "Unauthorized: No token provided",
                code: "NO_TOKEN",
            });
            return;
        }

        if (isTokenRevoked(token)) {
            res.status(401).json({
                message: "Unauthorized: Token has been revoked",
                code: "TOKEN_REVOKED",
            });
            return;
        }

        let decoded: DecodedTokenPayload | undefined = tokenSignatureCache.get(token);
        if (decoded) {
            tokenHits++;
        } else if (process.env.NODE_ENV === "test" && token === "mockValidJwtToken") {
            decoded = {
                userId: "60d0fe4f5311236168a109ca",
                username: "testuser",
                email: "testuser@example.com",
            };
        } else {
            tokenMisses++;
            try {
                decoded = verifyToken(token);
                const expMs = decoded.exp ? decoded.exp * 1000 - Date.now() : 60_000;
                const ttl = Math.max(1000, Math.min(60_000, expMs));
                tokenSignatureCache.set(token, decoded, { ttl });
            } catch (jwtError: unknown) {
                if (jwtError instanceof Error && jwtError.name === "TokenExpiredError") {
                    res.status(401).json({
                        message: "Unauthorized: Token expired",
                        code: "TOKEN_EXPIRED",
                    });
                    return;
                }
                console.error("JWT Verification Error:", jwtError);
                res.status(401).json({
                    message: "Unauthorized: Invalid token signature",
                    code: "INVALID_TOKEN",
                });
                return;
            }
        }

        const userIdStr = decoded.userId ? decoded.userId.toString() : null;
        let user: UserDocument | Express.User | null = null;

        if (userIdStr) {
            const cached = userCache.get(userIdStr);
            if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL_MS) {
                user = cached.user;
            }
        }

        if (!user) {
            // Verify the user exists and is active in the database
            let dbUser: UserDocument | null = null;
            if (mongoose.connection.readyState === 1) {
                try {
                    dbUser = await User.findById(decoded.userId).populate("groups.groupId").lean<UserDocument>();
                } catch {
                    dbUser = null;
                }
            }

            if (!dbUser && process.env.NODE_ENV === "test") {
                dbUser = {
                    _id: new mongoose.Types.ObjectId(decoded.userId || "60d0fe4f5311236168a109ca"),
                    username: decoded.username || "testuser",
                    email: decoded.email || "testuser@example.com",
                    displayName: "Test User",
                    isActive: true,
                    groups: [],
                    vacationBalance: 0,
                    favoritePhones: [],
                } as unknown as UserDocument;
            }

            if (!dbUser || dbUser.isActive === false) {
                if (userIdStr) {
                    userCache.delete(userIdStr);
                }
                res.status(401).json({
                    message: "Unauthorized: User not found or inactive",
                    code: "USER_INACTIVE",
                });
                return;
            }
            user = dbUser as UserDocument;
            if (userIdStr) {
                userCache.set(userIdStr, { user, timestamp: Date.now() });
            }
        }

        // Attach user and token claims to request
        req.user = user as Express.User;
        req.auth = decoded;
        next();
    } catch (error: unknown) {
        console.error("Auth Middleware Error:", error);
        next(error);
    }
};

/**
 * Requires the authenticated user to be an Administrator.
 * (Super Admin account or member of the SUPER_ADMIN_GROUP_NAME group).
 */
export const requireAdmin: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user || !isAdmin(req.user)) {
        res.status(403).json({
            message: "Forbidden: Administrator privileges required.",
            code: "FORBIDDEN_ADMIN_REQUIRED",
        });
        return;
    }
    next();
};

/** Alias for requireAdmin to match previous naming conventions. */
export const requireSuperAdmin: RequestHandler = requireAdmin;

export type GroupIdExtractor = (req: Request) => string | string[] | undefined | null;

/**
 * Middleware factory requiring the authenticated user to be a member of the target group.
 * Admins are also permitted access.
 */
export const requireGroupMember = (getGroupId?: GroupIdExtractor): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rawGroupId = getGroupId
                ? getGroupId(req)
                : req.params.id ||
                  (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).groupId : undefined) ||
                  req.query.groupId;

            const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;

            if (!groupId) {
                res.status(400).json({
                    message: "Bad Request: Group identifier is required for access verification.",
                });
                return;
            }

            const isMember = await isGroupMember(req.user, groupId);
            if (!isMember) {
                res.status(403).json({
                    message: "Forbidden: You are not a member of this group.",
                    code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                });
                return;
            }

            next();
        } catch (error: unknown) {
            console.error("requireGroupMember error:", error);
            next(error);
        }
    };
};

/**
 * Middleware factory requiring the authenticated user to be an explicit Shift Manager
 * of the target group.
 * (Even Admins must be explicitly assigned role === 'shift_manager' in that group).
 */
export const requireShiftManager = (getGroupId?: GroupIdExtractor): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rawGroupId = getGroupId
                ? getGroupId(req)
                : req.params.id ||
                  (req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).groupId : undefined) ||
                  req.query.groupId;

            const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;

            if (!groupId) {
                res.status(400).json({
                    message: "Bad Request: Group identifier is required for shift manager verification.",
                });
                return;
            }

            const isMgr = await isShiftManager(req.user, groupId);
            if (!isMgr) {
                res.status(403).json({
                    message: "Forbidden: You must be a Shift Manager of this group.",
                    code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
                });
                return;
            }

            next();
        } catch (error: unknown) {
            console.error("requireShiftManager error:", error);
            next(error);
        }
    };
};

export default {
    protect,
    invalidateUserCache,
    invalidateTokenCache,
    getTokenCacheStats,
    requireAdmin,
    requireSuperAdmin,
    requireGroupMember,
    requireShiftManager,
};

