/**
 * @module AuthMiddleware
 *
 * Provides authentication-related middleware functions.
 * Currently supports a simplified user identification flow based on a custom header.
 */

const User = require("../models/User");

/**
 * Identifies a user based on the 'x-user-id' header and attaches the user object to the request.
 *
 * This middleware is "passive"—it does not block requests if authentication fails.
 * Instead, it populates `req.user` if a valid user ID is provided. Downstream
 * route handlers are responsible for checking `req.user` and responding with 401
 * if authentication is mandatory for a specific endpoint.
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
        // Attempt to retrieve the User ID from the custom header.
        const userId = req.headers["x-user-id"];

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: No user ID provided" });
        }

        // Verify the user exists in the database.
        const user = await User.findById(userId);
        if (!user) {
            return res.status(401).json({ message: "Unauthorized: Invalid user ID" });
        }

        // Attach the user object to the request for use in subsequent middleware/routes.
        req.user = user;
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = { protect };
