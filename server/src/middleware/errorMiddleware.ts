/**
 * @module ErrorMiddleware
 *
 * Centralized error handling and fallback 404 routing middleware.
 * Intercepts unmatched requests and unhandled application errors, formatting
 * all responses into structured JSON while sanitizing internal stack traces in production.
 */

import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";
import config from "../config";

export interface CustomHttpError extends Error {
    readonly code?: string | number;
    readonly statusCode?: number;
    readonly status?: number;
    readonly keyPattern?: Record<string, unknown>;
    readonly keyValue?: Record<string, unknown>;
    readonly path?: string;
    readonly value?: unknown;
}

export interface StandardErrorResponse {
    readonly message: string;
    readonly code: string;
    stack?: string;
}

/**
 * Catches requests to undefined routes and forwards a 404 Not Found error to the error handler.
 */
export const notFoundHandler: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const error: Error & { code?: string } = new Error(`Resource not found: ${req.method} ${req.originalUrl}`);
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
 */
export const errorHandler: ErrorRequestHandler = (
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (res.headersSent) {
        next(err);
        return;
    }

    let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    let message = "Internal server error";
    let code = "INTERNAL_ERROR";

    if (err instanceof Error) {
        message = err.message || message;
        const customErr = err as CustomHttpError;

        // Handle malformed JSON body from express.json()
        if (err instanceof SyntaxError && customErr.status === 400 && "body" in err) {
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
            message = `Invalid format for field '${customErr.path ?? "field"}': ${String(customErr.value ?? "")}`;
            code = "INVALID_IDENTIFIER";
        } else if (
            customErr.code === 11000 ||
            (err.name === "MongoServerError" && customErr.code === 11000)
        ) {
            statusCode = 409;
            const keyPatternOrValue = customErr.keyPattern || customErr.keyValue || {};
            const field = Object.keys(keyPatternOrValue)[0] || "field";
            message = `Duplicate value for '${field}'. An entry with this ${field} already exists.`;
            code = "DUPLICATE_KEY";
        } else if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError") {
            statusCode = 401;
            message = "Unauthorized: Invalid or expired token";
            code = "INVALID_TOKEN";
        } else if (typeof customErr.statusCode === "number") {
            statusCode = customErr.statusCode;
        } else if (typeof customErr.status === "number") {
            statusCode = customErr.status;
        }

        if (code === "INTERNAL_ERROR" && typeof customErr.code === "string") {
            code = customErr.code;
        }
    } else if (typeof err === "object" && err !== null) {
        const objErr = err as Record<string, unknown>;
        if (typeof objErr.message === "string") {
            message = objErr.message;
        }
        if (typeof objErr.code === "string") {
            code = objErr.code;
        }
        if (typeof objErr.statusCode === "number") {
            statusCode = objErr.statusCode;
        } else if (typeof objErr.status === "number") {
            statusCode = objErr.status;
        }
    }

    // Log severe/unexpected errors for server diagnostics
    if (statusCode >= 500) {
        console.error(`❌ [${req.method} ${req.originalUrl}] Unhandled Error:`, err);
    }

    const response: StandardErrorResponse = {
        message,
        code,
    };

    // Include stack trace only in non-production environments
    const isProduction = config.isProd || process.env.NODE_ENV === "production";
    if (!isProduction && err instanceof Error && err.stack) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

export default {
    notFoundHandler,
    errorHandler,
};

// CommonJS compatibility
module.exports = {
    notFoundHandler,
    errorHandler,
};
module.exports.default = {
    notFoundHandler,
    errorHandler,
};

