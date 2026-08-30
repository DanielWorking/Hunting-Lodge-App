/**
 * @module SanitizationMiddleware
 *
 * Provides request body sanitization and immutability guards across API endpoints.
 * Enforces SSO field immutability by stripping or rejecting unauthorized mutations
 * to SSO-authoritative identity properties (such as displayName, sub, and oidcId).
 */

const IMMUTABLE_SSO_FIELDS = ["displayName", "sub", "oidcId"];

/**
 * Recursively removes immutable SSO fields from an object or array.
 *
 * @param {any} target - Target object or array to sanitize.
 */
function sanitizePayload(target) {
    if (!target || typeof target !== "object") return;

    if (Array.isArray(target)) {
        for (let i = 0; i < target.length; i++) {
            sanitizePayload(target[i]);
        }
        return;
    }

    for (const field of IMMUTABLE_SSO_FIELDS) {
        if (field in target) {
            delete target[field];
        }
    }

    for (const key of Object.keys(target)) {
        if (target[key] && typeof target[key] === "object") {
            sanitizePayload(target[key]);
        }
    }
}

/**
 * Express middleware that sanitizes incoming write requests (POST, PUT, PATCH).
 * Strips SSO-governed immutable fields from req.body to prevent mass-assignment
 * or accidental/malicious overwrite of OIDC identity data in MongoDB.
 *
 * @function stripImmutableFields
 * @param {import("express").Request} req - Express request object.
 * @param {import("express").Response} res - Express response object.
 * @param {import("express").NextFunction} next - Express next callback.
 * @returns {void}
 */
const stripImmutableFields = (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body && typeof req.body === "object") {
        sanitizePayload(req.body);
    }
    next();
};

module.exports = {
    stripImmutableFields,
    sanitizePayload,
    IMMUTABLE_SSO_FIELDS,
};
