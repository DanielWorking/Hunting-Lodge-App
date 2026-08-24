/**
 * @module JWTUtil
 * 
 * Provides utility functions for generating and verifying JSON Web Tokens (JWT).
 * Used to secure API authentication across client and server interactions.
 */

const jwt = require("jsonwebtoken");
const config = require("../config");

/**
 * Generates a signed JSON Web Token for an authenticated user.
 * 
 * @function generateToken
 * @param {Object} user - The user object from database.
 * @param {string|Object} [user._id] - MongoDB ObjectId.
 * @param {string} [user.id] - User identifier fallback.
 * @param {string} user.username - Unique username.
 * @param {string} [user.email] - User's email address.
 * @returns {string} The signed JWT string.
 */
function generateToken(user) {
    const userId = user._id ? user._id.toString() : user.id;
    const payload = {
        userId,
        username: user.username,
        email: user.email || "",
    };

    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn || "7d",
    });
}

/**
 * Verifies and decodes a signed JSON Web Token.
 * 
 * @function verifyToken
 * @param {string} token - The JWT string to verify.
 * @returns {Object} The decoded token payload.
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError} If verification fails.
 */
function verifyToken(token) {
    return jwt.verify(token, config.jwt.secret);
}

module.exports = {
    generateToken,
    verifyToken,
};
