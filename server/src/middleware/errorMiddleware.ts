/**
 * @module ErrorMiddleware
 *
 * Centralized error handling and fallback 404 routing middleware.
 * Intercepts unmatched requests and unhandled application errors, formatting
 * all responses into structured JSON. 5xx bodies are generic; only when error details are switched
 * on (nonprod's EXPOSE_ERROR_DETAILS) do they also carry `details` for developers.
 */

import { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from "express";

export interface CustomHttpError extends Error {
    readonly code?: string | number;
    readonly statusCode?: number;
    readonly status?: number;
    readonly keyPattern?: Record<string, unknown>;
    readonly keyValue?: Record<string, unknown>;
    readonly path?: string;
    readonly value?: unknown;
}

export interface ErrorFieldDetail {
    readonly field: string;
    readonly message: string;
}

/** Developer diagnostics added to 5xx bodies when error details are switched on. */
export interface ErrorDetails {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
}

export interface StandardErrorResponse {
    readonly message: string;
    readonly code: string;
    errors?: ErrorFieldDetail[];
    details?: ErrorDetails;
}

export interface ErrorHandlerOptions {
    /** Add `details` (name, message, stack) to 5xx bodies. Nonprod only; off by default. */
    readonly exposeErrorDetails?: boolean;
}

function describeError(err: unknown): ErrorDetails {
    if (err instanceof Error) {
        return { name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}) };
    }
    return { name: "NonError", message: typeof err === "string" ? err : JSON.stringify(err) ?? String(err) };
}

/**
 * Maps a Mongoose ValidationError's per-path errors to the same
 * `{ field, message }` shape that the Zod validation middleware returns.
 * The `errors` keys are full dotted paths (e.g. `shifts.0.vacationValue`), unlike each
 * error's own `path`, which is only the leaf name inside an array subdocument.
 */
export function extractMongooseFieldErrors(err: unknown): ErrorFieldDetail[] {
    const pathErrors = (err as { errors?: Record<string, { message?: string }> } | null)?.errors;
    if (!pathErrors || typeof pathErrors !== "object") {
        return [];
    }
    return Object.entries(pathErrors).map(([fieldPath, detail]) => ({
        field: fieldPath,
        message: detail?.message || "Invalid value",
    }));
}

/**
 * Catches requests to undefined routes and forwards a 404 Not Found error to the error handler.
 */
export const notFoundHandler: RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (res.headersSent) {
        next();
        return;
    }
    const error: Error & { code?: string } = new Error(`Resource not found: ${req.method} ${req.originalUrl}`);
    error.code = "NOT_FOUND";
    res.status(404);
    next(error);
};

/**
 * Creates the handler for unhandled application errors, which formats standard JSON error responses.
 *
 * Maps well-known errors (e.g., malformed JSON payloads, Mongoose validation) to appropriate HTTP
 * status codes and user-friendly error messages. A 5xx body always says "Internal server error"
 * with its code; `details` is added only when `options.exposeErrorDetails` is on.
 */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
    const exposeErrorDetails = options.exposeErrorDetails === true;
    return (
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
        let fieldErrors: ErrorFieldDetail[] = [];

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
                fieldErrors = extractMongooseFieldErrors(err);
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
            // Internal failures (database hosts, network errors, library messages) stay in the log
            message = "Internal server error";
        }

        const response: StandardErrorResponse = {
            message,
            code,
            ...(fieldErrors.length > 0 ? { errors: fieldErrors } : {}),
            // Same contract for clients; the extra field is for developers reading nonprod responses
            ...(statusCode >= 500 && exposeErrorDetails ? { details: describeError(err) } : {}),
        };

        res.status(statusCode).json(response);
    };
}

/** The error handler with error details off, as in preprod and prod. */
export const errorHandler: ErrorRequestHandler = createErrorHandler();
