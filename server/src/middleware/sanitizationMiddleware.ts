/**
 * @module SanitizationMiddleware
 *
 * Provides request body sanitization and immutability guards across API endpoints.
 * Enforces SSO field immutability by stripping or rejecting unauthorized mutations
 * to SSO-authoritative identity properties (such as displayName, sub, and oidcId).
 */

import { Request, Response, NextFunction, RequestHandler } from "express";

export const IMMUTABLE_SSO_FIELDS: readonly string[] = ["displayName", "sub", "oidcId"];

/**
 * Recursively removes immutable SSO fields from an object or array.
 *
 * @param target - Target object or array to sanitize.
 */
export function sanitizePayload(target: unknown): void {
    if (!target || typeof target !== "object") {
        return;
    }

    if (Array.isArray(target)) {
        for (let i = 0; i < target.length; i++) {
            sanitizePayload(target[i]);
        }
        return;
    }

    const record = target as Record<string, unknown>;

    for (const field of IMMUTABLE_SSO_FIELDS) {
        if (field in record) {
            delete record[field];
        }
    }

    for (const key of Object.keys(record)) {
        const val = record[key];
        if (val && typeof val === "object") {
            sanitizePayload(val);
        }
    }
}

/**
 * Express middleware that sanitizes incoming write requests (POST, PUT, PATCH).
 * Strips SSO-governed immutable fields from req.body to prevent mass-assignment
 * or accidental/malicious overwrite of OIDC identity data in MongoDB.
 */
export const stripImmutableFields: RequestHandler = (
    req: Request,
    _res: Response,
    next: NextFunction
): void => {
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body && typeof req.body === "object") {
        sanitizePayload(req.body);
    }
    next();
};

export default stripImmutableFields;

// CommonJS compatibility
module.exports = {
    stripImmutableFields,
    sanitizePayload,
    IMMUTABLE_SSO_FIELDS,
};
module.exports.default = stripImmutableFields;

