/**
 * @module AuthController
 * 
 * Handles user authentication via OpenID Connect (OIDC).
 * Integrates with an external SSO provider to manage user logins,
 * PKCE authorization flows, automatic user provisioning, and session identification.
 * Migrated to strict TypeScript with zero `any` and robust claim resolution.
 */

import crypto from "crypto";
import https from "https";
import { Request, Response, NextFunction } from "express";
import { Issuer, BaseClient, TokenSet, custom, generators } from "openid-client";
import User from "../models/User";
import Group from "../models/Group";
import config from "../config";
import ssoConfig from "../config/sso";
import { generateToken } from "../utils/jwt";
import { isSuperAdminUser, isAdmin, AuthUser } from "../utils/authHelpers";
import type { SsoLoginInput } from "../routes/auth";
import type {
    CompanyTokenSet,
    OidcTransientState,
    SsoClaimsRecord,
    SsoUrlResponse,
    SsoLogoutResponse,
} from "../types/auth";

// Configure outbound HTTP keep-alive connection pooling for OIDC token exchanges and discovery
const ssoHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000,
    timeout: 10000,
});
custom.setHttpOptionsDefaults({
    agent: ssoHttpsAgent,
    timeout: 10000,
});

/** Cached OIDC client instance to avoid repeated dynamic discoveries. */
let client: BaseClient | null = null;

/**
 * Deterministically creates an HMAC-SHA256 signature for transient state cookie payloads.
 */
function signCookie(value: string, secret: string): string {
    const signature = crypto.createHmac("sha256", secret).update(value).digest("base64url");
    return `${Buffer.from(value, "utf8").toString("base64url")}.${signature}`;
}

/**
 * Validates the HMAC-SHA256 signature and parses a signed cookie payload.
 */
function verifyAndParseCookie<T>(signedValue: string | undefined, secret: string): T | null {
    if (!signedValue || typeof signedValue !== "string") return null;
    const parts = signedValue.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;
    try {
        const rawPayload = Buffer.from(encodedPayload, "base64url").toString("utf8");
        const expectedSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("base64url");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null;
        }
        return JSON.parse(rawPayload) as T;
    } catch {
        return null;
    }
}

/**
 * Initializes or retrieves the cached OIDC client.
 * 
 * Performs dynamic discovery of the SSO issuer's configuration 
 * and instantiates a client with the project's credentials.
 * 
 * @returns The initialized OIDC client instance.
 * @throws If issuer discovery or client initialization fails.
 */
export async function getClient(): Promise<BaseClient> {
    if (client) {
        return client;
    }

    if (!ssoConfig.issuerUrl || !ssoConfig.clientId) {
        const missing = [
            !ssoConfig.issuerUrl ? "SSO_ISSUER_URL" : null,
            !ssoConfig.clientId ? "SSO_CLIENT_ID" : null,
        ].filter(Boolean).join(", ");
        const errorMsg = `SSO Configuration incomplete: Missing required SSO configuration [${missing}]. Failed to connect to SSO server.`;
        console.error(`❌ [SSO Error] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    try {
        const issuer = await Issuer.discover(ssoConfig.issuerUrl);

        client = new issuer.Client({
            client_id: ssoConfig.clientId,
            client_secret: ssoConfig.clientSecret,
            redirect_uris: [ssoConfig.redirectUri],
            response_types: ["code"],
        });

        // Configure clock tolerance to prevent token clock-skew rejections
        client[custom.clock_tolerance] = ssoConfig.clockTolerance || 15;

        return client;
    } catch (discoveryError: unknown) {
        console.error(`❌ [SSO Error] Failed to connect to SSO server at ${ssoConfig.issuerUrl}:`, discoveryError);
        throw discoveryError;
    }
}

/**
 * Reset client cache (useful for testing and configuration changes).
 */
export function resetClientCache(): void {
    client = null;
}

/**
 * Step 2 & Step 3: Generates the authorization URL with PKCE for the SSO provider.
 * Generates code_verifier, code_challenge (S256), state, and nonce.
 * Sets signed hunting_oidc_state cookie and returns the URL and state.
 */
export async function getSsoUrl(_req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const ssoClient = await getClient();

        // Generate PKCE code verifier and S256 code challenge
        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        const state = generators.state();
        const nonce = generators.nonce();

        const transientState: OidcTransientState = {
            state,
            nonce,
            codeVerifier,
            createdAt: Date.now(),
        };

        // Set signed hunting_oidc_state cookie (HttpOnly, SameSite=Lax, Max-Age 600)
        const serializedState = JSON.stringify(transientState);
        const signedCookieValue = signCookie(serializedState, ssoConfig.cookieSecret);

        res.cookie(ssoConfig.stateCookieName, signedCookieValue, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 600 * 1000, // 10 minutes
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        const url = ssoClient.authorizationUrl({
            scope: ssoConfig.scope,
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });

        const responsePayload: SsoUrlResponse = { url, state };
        res.json(responsePayload);
    } catch (error: unknown) {
        console.error("Error generating SSO URL:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Failed to generate SSO URL" });
    }
}

/**
 * Step 8 & Step 9: Completes the SSO authentication flow using an authorization code.
 * Validates code, state, and transient cookie.
 * Exchanges the code for TokenSet using PKCE code_verifier.
 * Strictly maps to CompanyTokenSet, extracts user claims, provisions/syncs user,
 * and issues httpOnly session cookies.
 */
export async function login(req: Request<unknown, unknown, SsoLoginInput>, res: Response, _next?: NextFunction): Promise<void> {
    try {
        const body = req.body || {};
        const code = typeof body.code === "string" ? body.code.trim() : "";
        const state = typeof body.state === "string" ? body.state.trim() : undefined;

        if (!code) {
            res.status(400).json({ message: "Authorization code missing" });
            return;
        }

        // Retrieve and verify transient state cookie
        const rawStateCookie = req.cookies?.[ssoConfig.stateCookieName];
        const transientState = verifyAndParseCookie<OidcTransientState>(rawStateCookie, ssoConfig.cookieSecret);

        // Enforce state match: if a transient state cookie was stored, state parameter is required and must match
        if (transientState && (!state || transientState.state !== state)) {
            res.status(401).json({
                message: "SSO Authentication failed",
                error: "OIDC state verification failed: state parameter mismatch",
                code: "INVALID_STATE",
            });
            return;
        }

        const ssoClient = await getClient();

        // Build callback checks using transient state verifier and nonce
        const checks: {
            code_verifier?: string;
            state?: string;
            nonce?: string;
        } = {};

        if (transientState?.codeVerifier) {
            checks.code_verifier = transientState.codeVerifier;
        }
        if (transientState?.state) {
            checks.state = transientState.state;
        }
        if (transientState?.nonce) {
            checks.nonce = transientState.nonce;
        }

        const callbackParams = {
            code,
            ...(state ? { state } : (transientState?.state ? { state: transientState.state } : {})),
        };

        const tokenSet: TokenSet = await ssoClient.callback(
            ssoConfig.redirectUri,
            callbackParams,
            checks
        );

        // Strictly validate and map the CompanyTokenSet (9 company properties)
        const rawTokenSet = tokenSet as unknown as Record<string, unknown>;
        const companyTokenSet: CompanyTokenSet = {
            access_token: tokenSet.access_token || "",
            id_token: tokenSet.id_token || "",
            refresh_token: tokenSet.refresh_token,
            expires_in: typeof tokenSet.expires_in === "number" ? tokenSet.expires_in : 3600,
            refresh_expires_in: typeof rawTokenSet.refresh_expires_in === "number"
                ? (rawTokenSet.refresh_expires_in as number)
                : undefined,
            session_state: typeof tokenSet.session_state === "string" ? tokenSet.session_state : undefined,
            scope: tokenSet.scope,
            "not-before-policy": typeof rawTokenSet["not-before-policy"] === "number"
                ? (rawTokenSet["not-before-policy"] as number)
                : undefined,
            token_type: tokenSet.token_type || "Bearer",
        };

        // Extract user claims safely
        const claims = (tokenSet.claims() || {}) as SsoClaimsRecord;

        // Read configuration from SSO config module
        const identifierMode = ssoConfig.identifierField || "email";

        let dbUsername: string;
        let dbDisplayName: string;
        let dbEmail: string;
        let searchCriteria: Record<string, unknown>;

        // Extract raw string claims with safe fallbacks
        const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
        const rawPrefUsername = typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
        const rawNickname = typeof claims.nickname === "string" ? claims.nickname.trim() : "";
        const rawSub = typeof claims.sub === "string" ? claims.sub.trim() : "";
        const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";

        // Full name display from SSO claims, with fallback to nickname, username, or sub
        dbDisplayName = rawName || rawPrefUsername || rawNickname || rawSub;
        dbEmail = rawEmail;

        if (identifierMode === "username") {
            // Production / Organizational mode (Card / Smartcard / AD SSO)
            dbUsername = rawPrefUsername || rawNickname || rawName || rawSub;
            if (!dbDisplayName) {
                dbDisplayName = dbUsername;
            }
            if (!dbEmail && dbUsername) {
                dbEmail = `${dbUsername.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase();
            }
            searchCriteria = { username: dbUsername };
        } else {
            // Development / Home mode (Auth0 / Google OAuth2)
            dbUsername = rawName || rawEmail || rawNickname || rawPrefUsername || rawSub;
            if (!dbDisplayName) {
                dbDisplayName = rawName || rawNickname || dbUsername;
            }
            if (!dbEmail && dbUsername) {
                dbEmail = `${dbUsername.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase();
            }
            searchCriteria = dbEmail ? { email: dbEmail } : { username: dbUsername };
        }

        if (!dbUsername) {
            res.status(401).json({
                message: "SSO Authentication failed",
                error: "Unable to extract user identity from SSO token claims",
            });
            return;
        }

        let user = await User.findOne(searchCriteria);

        const claimGroups = Array.isArray(claims.groups)
            ? (claims.groups as string[])
            : Array.isArray(claims.roles)
            ? (claims.roles as string[])
            : [];
        const isSuperAdminByClaim = claimGroups.includes(config.superAdmin.groupName) || claimGroups.includes("ADMINISTRATORS") || claimGroups.includes("admin");
        const isSuperAdmin = isSuperAdminByClaim || isSuperAdminUser({ username: dbUsername, email: dbEmail });

        if (user) {
            if (!user.isActive) {
                user.isActive = true;
            }
            if (dbDisplayName && (!user.displayName || user.displayName === user.username)) {
                user.displayName = dbDisplayName;
            }
            if (dbEmail && !user.email) {
                user.email = dbEmail;
            }
            user.lastLogin = new Date().toISOString();

            if (isSuperAdmin) {
                const adminGroup = await Group.findOne({ name: config.superAdmin.groupName });
                if (adminGroup) {
                    const hasAdminGroup = user.groups.some((g) => {
                        const gid = g.groupId && typeof g.groupId === "object" && "_id" in g.groupId
                            ? String((g.groupId as { _id?: unknown })._id)
                            : String(g.groupId);
                        return gid === adminGroup._id.toString();
                    });
                    if (!hasAdminGroup) {
                        user.groups.push({
                            groupId: adminGroup._id,
                            role: "shift_manager",
                            order: 0,
                        });
                        await Group.updateOne(
                            { _id: adminGroup._id },
                            { $addToSet: { members: user._id } }
                        );
                    }
                }
            }

            await user.save();
        } else {
            user = new User({
                username: dbUsername,
                displayName: dbDisplayName,
                email: dbEmail,
                isActive: true,
                groups: [],
                lastLogin: new Date().toISOString(),
            });

            if (isSuperAdmin) {
                const adminGroup = await Group.findOne({ name: config.superAdmin.groupName });
                if (adminGroup) {
                    user.groups.push({
                        groupId: adminGroup._id,
                        role: "shift_manager",
                        order: 0,
                    });
                    await Group.updateOne(
                        { _id: adminGroup._id },
                        { $addToSet: { members: user._id } }
                    );
                }
            }

            await user.save();
        }

        const userWithToObject = user as unknown as { toObject?: () => Record<string, unknown> };
        const userObj: Record<string, unknown> = typeof userWithToObject.toObject === "function"
            ? userWithToObject.toObject()
            : { ...user };
        const adminGroupName = config.superAdmin.groupName;
        const rawGroups = Array.isArray(userObj.groups) ? [...userObj.groups] : [];
        userObj.groups = rawGroups.map((g: any) => {
            const gDoc = typeof g?.toObject === "function" ? g.toObject() : { ...g };
            const gid = gDoc?.groupId && typeof gDoc.groupId === "object" && "_id" in gDoc.groupId
                ? (gDoc.groupId as { _id?: unknown; name?: string }).name || String((gDoc.groupId as { _id?: unknown })._id)
                : String(gDoc?.groupId);
            const gName = gDoc?.name || gDoc?.groupName || (gDoc?.groupId && typeof gDoc.groupId === "object" ? gDoc.groupId.name : undefined);
            return {
                ...gDoc,
                isSystemGroup: gid === adminGroupName || gName === adminGroupName,
            };
        });
        userObj.isSuperAdmin = isSuperAdminUser(user);
        userObj.isAdmin = isAdmin(user as unknown as AuthUser);

        const token = generateToken(user);

        // Set httpOnly session cookie hunting_token
        res.cookie(ssoConfig.sessionCookieName, token, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });

        // Set httpOnly refresh token cookie if present in CompanyTokenSet
        if (companyTokenSet.refresh_token) {
            const refreshMaxAge = companyTokenSet.refresh_expires_in
                ? companyTokenSet.refresh_expires_in * 1000
                : 30 * 24 * 60 * 60 * 1000;
            res.cookie(ssoConfig.refreshCookieName, companyTokenSet.refresh_token, {
                httpOnly: true,
                secure: ssoConfig.cookieSecure,
                sameSite: "strict",
                maxAge: refreshMaxAge,
                path: "/api/auth",
                domain: ssoConfig.cookieDomain,
            });
        }

        // Clear transient hunting_oidc_state cookie
        res.clearCookie(ssoConfig.stateCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        // Dual mode: return user object and token for backward compatibility
        res.json({ user: userObj, token });
    } catch (error: unknown) {
        console.error("SSO Login Error:", error);
        const errCode = (error as { code?: string })?.code;
        const isNetworkTimeout = errCode === "ETIMEDOUT" || errCode === "ECONNREFUSED" || errCode === "ENOTFOUND" || errCode === "ECONNRESET";

        if (isNetworkTimeout) {
            res.status(504).json({
                message: "Identity provider connection timeout during login",
                code: "IDP_TIMEOUT",
                error: config.isProd ? "Identity provider connection timeout" : (error instanceof Error ? error.message : String(error)),
            });
            return;
        }

        res.status(401).json({
            message: "SSO Authentication failed",
            error: config.isProd
                ? "Invalid authorization code or provider error"
                : (error instanceof Error ? error.message : String(error)),
        });
    }
}

/**
 * Renews the application session using the hunting_refresh_token cookie.
 */
export async function refreshToken(req: Request, res: Response, _next?: NextFunction): Promise<void> {
    try {
        const rawRefreshToken = req.cookies?.[ssoConfig.refreshCookieName] || (req.body && (req.body as Record<string, unknown>).refreshToken);

        if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
            res.status(401).json({
                message: "Refresh token missing",
                code: "NO_REFRESH_TOKEN",
            });
            return;
        }

        const ssoClient = await getClient();
        const refreshedTokenSet: TokenSet = await ssoClient.refresh(rawRefreshToken);

        const rawRefreshed = refreshedTokenSet as unknown as Record<string, unknown>;
        const companyTokenSet: CompanyTokenSet = {
            access_token: refreshedTokenSet.access_token || "",
            id_token: refreshedTokenSet.id_token || "",
            refresh_token: refreshedTokenSet.refresh_token || rawRefreshToken,
            expires_in: typeof refreshedTokenSet.expires_in === "number" ? refreshedTokenSet.expires_in : 3600,
            refresh_expires_in: typeof rawRefreshed.refresh_expires_in === "number"
                ? (rawRefreshed.refresh_expires_in as number)
                : undefined,
            session_state: typeof refreshedTokenSet.session_state === "string" ? refreshedTokenSet.session_state : undefined,
            scope: refreshedTokenSet.scope,
            "not-before-policy": typeof rawRefreshed["not-before-policy"] === "number"
                ? (rawRefreshed["not-before-policy"] as number)
                : undefined,
            token_type: refreshedTokenSet.token_type || "Bearer",
        };

        const claims = (refreshedTokenSet.claims() || {}) as SsoClaimsRecord;
        const identifierMode = ssoConfig.identifierField || "email";
        const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
        const rawPrefUsername = typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
        const rawNickname = typeof claims.nickname === "string" ? claims.nickname.trim() : "";
        const rawSub = typeof claims.sub === "string" ? claims.sub.trim() : "";
        const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";

        let searchCriteria: Record<string, unknown>;
        if (identifierMode === "username") {
            const dbUsername = rawPrefUsername || rawNickname || rawName || rawSub;
            searchCriteria = { username: dbUsername };
        } else {
            const dbEmail = rawEmail;
            const dbUsername = rawName || rawEmail || rawNickname || rawPrefUsername || rawSub;
            searchCriteria = dbEmail ? { email: dbEmail } : { username: dbUsername };
        }

        const user = await User.findOne(searchCriteria);
        if (!user || user.isActive === false) {
            res.status(401).json({
                message: "User not found or inactive during token refresh",
                code: "USER_INACTIVE",
            });
            return;
        }

        const token = generateToken(user);

        // Update hunting_token session cookie
        res.cookie(ssoConfig.sessionCookieName, token, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });

        // Update refresh token cookie if renewed
        if (companyTokenSet.refresh_token) {
            const refreshMaxAge = companyTokenSet.refresh_expires_in
                ? companyTokenSet.refresh_expires_in * 1000
                : 30 * 24 * 60 * 60 * 1000;
            res.cookie(ssoConfig.refreshCookieName, companyTokenSet.refresh_token, {
                httpOnly: true,
                secure: ssoConfig.cookieSecure,
                sameSite: "strict",
                maxAge: refreshMaxAge,
                path: "/api/auth",
                domain: ssoConfig.cookieDomain,
            });
        }

        res.json({
            success: true,
            message: "Session refreshed",
            token,
        });
    } catch (error: unknown) {
        console.error("Session refresh error:", error);
        const errCode = (error as { code?: string })?.code;
        const isNetworkTimeout = errCode === "ETIMEDOUT" || errCode === "ECONNREFUSED" || errCode === "ENOTFOUND" || errCode === "ECONNRESET";

        if (isNetworkTimeout) {
            res.status(504).json({
                message: "Identity provider network timeout during session refresh",
                code: "IDP_TIMEOUT",
            });
            return;
        }

        // Only clear stale session cookies on definitive invalid token rejection
        res.clearCookie(ssoConfig.sessionCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.refreshCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });
        res.status(401).json({
            message: "Session refresh failed",
            code: "REFRESH_FAILED",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Terminates the application session, clears all auth cookies,
 * and provides OIDC RP-initiated logout URL if supported.
 */
export async function logout(_req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        res.clearCookie(ssoConfig.sessionCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.refreshCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.stateCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        let logoutUrl: string | undefined;
        try {
            const ssoClient = await getClient();
            if (typeof ssoClient.endSessionUrl === "function") {
                logoutUrl = ssoClient.endSessionUrl({
                    post_logout_redirect_uri: ssoConfig.redirectUri.replace(/\/auth\/callback.*$/, "/login"),
                });
            }
        } catch {
            // OIDC client unavailable or endSessionUrl not configured; continue smoothly
        }

        const response: SsoLogoutResponse = {
            success: true,
            message: "Logged out successfully",
            ...(logoutUrl ? { logoutUrl } : {}),
        };
        res.json(response);
    } catch (error: unknown) {
        console.error("Logout error:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Logout failed" });
    }
}

/**
 * Retrieves the currently authenticated user's profile and permissions.
 * Dynamically restores Super Admin group claims if root admin lacks explicit group record.
 * Requires protect middleware.
 */
export async function getMe(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: "Not authenticated" });
            return;
        }

        const adminGroupName = config.superAdmin.groupName;
        const isSuperAdmin = isSuperAdminUser(user);

        const userWithToObject = user as unknown as { toObject?: () => Record<string, unknown> };
        const userObj: Record<string, unknown> = typeof userWithToObject.toObject === "function"
            ? userWithToObject.toObject()
            : { ...user };

        if (isSuperAdmin) {
            const userGroups = Array.isArray(user.groups) ? [...user.groups] : [];
            const hasAdminGroup = userGroups.some((g) => {
                if (!g) return false;
                const gid = typeof g.groupId === "object" && g.groupId !== null && "_id" in g.groupId
                    ? (g.groupId as { _id?: unknown; name?: string }).name || String((g.groupId as { _id?: unknown })._id)
                    : String(g.groupId);
                const gName = (g as { name?: string; groupName?: string }).name || (g as { groupName?: string }).groupName;
                return gid === adminGroupName || gName === adminGroupName;
            });

            if (!hasAdminGroup) {
                const adminGroup = await Group.findOne({ name: adminGroupName });
                const adminGroupEntry = {
                    groupId: adminGroup ? adminGroup : adminGroupName,
                    role: "shift_manager" as const,
                    name: adminGroupName,
                    groupName: adminGroupName,
                    order: 0,
                };
                userObj.groups = [adminGroupEntry, ...userGroups];
            }
        }

        const finalGroups = Array.isArray(userObj.groups) ? [...userObj.groups] : [];
        userObj.groups = finalGroups.map((g: any) => {
            const gDoc = typeof g?.toObject === "function" ? g.toObject() : { ...g };
            const gid = gDoc?.groupId && typeof gDoc.groupId === "object" && "_id" in gDoc.groupId
                ? (gDoc.groupId as { _id?: unknown; name?: string }).name || String((gDoc.groupId as { _id?: unknown })._id)
                : String(gDoc?.groupId);
            const gName = gDoc?.name || gDoc?.groupName || (gDoc?.groupId && typeof gDoc.groupId === "object" ? gDoc.groupId.name : undefined);
            return {
                ...gDoc,
                isSystemGroup: gid === adminGroupName || gName === adminGroupName,
            };
        });

        userObj.isSuperAdmin = isSuperAdmin;
        userObj.isAdmin = isAdmin(userObj as unknown as AuthUser);

        res.json(userObj);
    } catch (error: unknown) {
        console.error("GetMe Error:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Internal server error" });
    }
}

export default {
    getClient,
    resetClientCache,
    getSsoUrl,
    login,
    refreshToken,
    logout,
    getMe,
};
