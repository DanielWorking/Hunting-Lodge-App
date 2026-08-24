/**
 * @module AuthMiddleware
 *
 * Provides authentication and role-based access control (RBAC) middleware functions.
 * Validates cryptographically signed JSON Web Tokens (JWT) from Bearer headers,
 * attaches the authenticated user record to incoming requests, and enforces
 * administrative, shift manager, and group membership permissions.
 */

const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");
const { isAdmin, isGroupMember, isShiftManager } = require("../utils/authHelpers");

/**
 * Protects routes by requiring a valid JSON Web Token in the Authorization header.
 * 
 * Verifies the token signature and expiration, retrieves the active user from
 * the database, and attaches the user document to `req.user`.
 *
 * @async
 * @function protect
 * @param {Object}   req  - Express request object.
 * @param {Object}   res  - Express response object.
 * @param {Function} next - Express next middleware function.
 * @returns {Promise<void>}
 */
const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;

        if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Unauthorized: No token provided",
                code: "NO_TOKEN",
            });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                message: "Unauthorized: Malformed authorization header",
                code: "MALFORMED_TOKEN",
            });
        }

        let decoded;
        try {
            decoded = verifyToken(token);
        } catch (jwtError) {
            if (jwtError.name === "TokenExpiredError") {
                return res.status(401).json({
                    message: "Unauthorized: Token expired",
                    code: "TOKEN_EXPIRED",
                });
            }
            return res.status(401).json({
                message: "Unauthorized: Invalid token signature",
                code: "INVALID_TOKEN",
            });
        }

        // Verify the user exists and is active in the database
        const user = await User.findById(decoded.userId);
        if (!user || user.isActive === false) {
            return res.status(401).json({
                message: "Unauthorized: User not found or inactive",
                code: "USER_INACTIVE",
            });
        }

        // Attach user and token claims to request
        req.user = user;
        req.auth = decoded;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Requires the authenticated user to be an Administrator.
 * (Super Admin account or member of the SUPER_ADMIN_GROUP_NAME group).
 *
 * @function requireAdmin
 * @param {Object}   req  - Express request object.
 * @param {Object}   res  - Express response object.
 * @param {Function} next - Express next middleware function.
 */
const requireAdmin = (req, res, next) => {
    if (!req.user || !isAdmin(req.user)) {
        return res.status(403).json({
            message: "Forbidden: Administrator privileges required.",
            code: "FORBIDDEN_ADMIN_REQUIRED",
        });
    }
    next();
};

/** Alias for requireAdmin to match previous naming conventions. */
const requireSuperAdmin = requireAdmin;

/**
 * Middleware factory requiring the authenticated user to be a member of the target group.
 * Admins are also permitted access.
 *
 * @function requireGroupMember
 * @param {Function} [getGroupId] - Function extracting groupId from the request.
 * @returns {Function} Express middleware handler.
 */
const requireGroupMember = (getGroupId) => {
    return async (req, res, next) => {
        try {
            const groupId = getGroupId
                ? getGroupId(req)
                : req.params.id || req.body.groupId || req.query.groupId;

            if (!groupId) {
                return res.status(400).json({
                    message: "Bad Request: Group identifier is required for access verification.",
                });
            }

            const isMember = await isGroupMember(req.user, groupId);
            if (!isMember) {
                return res.status(403).json({
                    message: "Forbidden: You are not a member of this group.",
                    code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                });
            }

            next();
        } catch (error) {
            console.error("requireGroupMember error:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
};

/**
 * Middleware factory requiring the authenticated user to be an explicit Shift Manager
 * of the target group.
 * (Even Admins must be explicitly assigned role === 'shift_manager' in that group).
 *
 * @function requireShiftManager
 * @param {Function} [getGroupId] - Function extracting groupId from the request.
 * @returns {Function} Express middleware handler.
 */
const requireShiftManager = (getGroupId) => {
    return async (req, res, next) => {
        try {
            const groupId = getGroupId
                ? getGroupId(req)
                : req.params.id || req.body.groupId || req.query.groupId;

            if (!groupId) {
                return res.status(400).json({
                    message: "Bad Request: Group identifier is required for shift manager verification.",
                });
            }

            const isMgr = await isShiftManager(req.user, groupId);
            if (!isMgr) {
                return res.status(403).json({
                    message: "Forbidden: You must be a Shift Manager of this group.",
                    code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
                });
            }

            next();
        } catch (error) {
            console.error("requireShiftManager error:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    };
};

module.exports = {
    protect,
    requireAdmin,
    requireSuperAdmin,
    requireGroupMember,
    requireShiftManager,
};
