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
        // The frontend currently sends this header with every request.
        const userId = req.headers["x-user-id"];

        if (userId) {
            // Verify the user exists in the database.
            const user = await User.findById(userId);
            if (user) {
                // Attach the user object to the request for use in subsequent middleware/routes.
                req.user = user;
            }
        }

        // Always proceed. Authorization (blocking access) is handled at the route level.
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        // On technical error, proceed without attaching a user.
        next();
    }
};

module.exports = { protect };
