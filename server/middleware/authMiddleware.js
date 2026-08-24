/**
 * @module AuthMiddleware
 *
 * Provides authentication-related middleware functions.
 * Validates cryptographically signed JSON Web Tokens (JWT) from Bearer headers
 * and attaches the authenticated user record to incoming requests.
 */

const User = require("../models/User");
const { verifyToken } = require("../utils/jwt");

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

module.exports = { protect };
