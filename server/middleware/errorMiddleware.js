/**
 * @module ErrorMiddleware
 *
 * Centralized error handling and fallback 404 routing middleware.
 * Intercepts unmatched requests and unhandled application errors, formatting
 * all responses into structured JSON while sanitizing internal stack traces in production.
 */

const config = require("../config");

/**
 * Catches requests to undefined routes and forwards a 404 Not Found error to the error handler.
 *
 * @function notFoundHandler
 * @param {import("express").Request}      req  - Express request object.
 * @param {import("express").Response}     res  - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
const notFoundHandler = (req, res, next) => {
    const error = new Error(`Resource not found: ${req.method} ${req.originalUrl}`);
    error.code = "NOT_FOUND";
    res.status(404);
    next(error);
};

/**
 * Handles unhandled application errors and formats standard JSON error responses.
 *
 * Sanitizes stack traces when running in production mode (`config.isProd`)
 * and maps well-known errors (e.g., malformed JSON payloads, Mongoose validation)
 * to appropriate HTTP status codes and user-friendly error messages.
 *
 * @function errorHandler
 * @param {Error | Object}                 err  - Thrown error or rejection object.
 * @param {import("express").Request}      req  - Express request object.
 * @param {import("express").Response}     res  - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    let message = err.message || "Internal server error";
    let code = err.code || "INTERNAL_ERROR";

    // Handle malformed JSON body from express.json()
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        statusCode = 400;
        message = "Invalid JSON payload in request body";
        code = "INVALID_JSON";
    } else if (err.name === "ValidationError") {
        // Mongoose Schema Validation Error
        statusCode = 400;
        message = err.message;
        code = "VALIDATION_ERROR";
    } else if (err.name === "CastError") {
        // Mongoose Invalid ObjectId Cast Error
        statusCode = 400;
        message = `Invalid format for field '${err.path}': ${err.value}`;
        code = "INVALID_IDENTIFIER";
    } else if (err.code === 11000 || (err.name === "MongoServerError" && err.code === 11000)) {
        statusCode = 409;
        const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
        message = `Duplicate value for '${field}'. An entry with this ${field} already exists.`;
        code = "DUPLICATE_KEY";
    } else if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "Unauthorized: Invalid or expired token";
        code = "INVALID_TOKEN";
    } else if (err.statusCode && typeof err.statusCode === "number") {
        statusCode = err.statusCode;
    } else if (err.status && typeof err.status === "number") {
        statusCode = err.status;
    }

    // Log severe/unexpected errors for server diagnostics
    if (statusCode >= 500) {
        console.error(`❌ [${req.method} ${req.originalUrl}] Unhandled Error:`, err);
    }

    const response = {
        message,
        code,
    };

    // Include stack trace only in non-production environments
    if (!config.isProd && err.stack) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

module.exports = {
    notFoundHandler,
    errorHandler,
};
