/**
 * @module ValidationMiddleware
 *
 * Provides schema validation middleware using Zod.
 * Validates `req.params`, `req.query`, and `req.body` against strict schemas.
 * Standardizes validation failure responses without leaking internal details.
 */

import { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodError } from "zod";

export interface RequestValidationSchemas<
    TParams extends z.ZodType = z.ZodType,
    TQuery extends z.ZodType = z.ZodType,
    TBody extends z.ZodType = z.ZodType
> {
    readonly params?: TParams;
    readonly query?: TQuery;
    readonly body?: TBody;
}

export interface ValidationErrorDetail {
    readonly field: string;
    readonly message: string;
}

export interface ValidationErrorResponse {
    readonly message: string;
    readonly code: "VALIDATION_ERROR";
    readonly errors: ReadonlyArray<ValidationErrorDetail>;
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

/**
 * Zod schema for a 24-character hexadecimal MongoDB ObjectId string.
 *
 * @param label - Field name used in the error messages.
 */
export function objectIdString(label: string): z.ZodString {
    return z
        .string({ message: `${label} is required` })
        .trim()
        .regex(OBJECT_ID_PATTERN, `${label} must be a valid ObjectId`);
}

/**
 * Zod schema for an ISO 8601 date (`2026-10-11`) or date-time string
 * (`2026-10-11T21:00:00.000Z`, with or without a UTC offset).
 *
 * @param label - Field name used in the error messages.
 */
export function isoDateString(label: string): z.ZodType<string> {
    const message = `${label} must be an ISO 8601 date or date-time string`;
    return z.union(
        [z.iso.datetime({ offset: true, local: true, message }), z.iso.date({ message })],
        { message },
    );
}

/**
 * Creates Express middleware to validate request parameters, query, and/or body.
 * Compatible with Express v5 getter-only query and params properties.
 *
 * @param schemas - Object containing optional Zod schemas for params, query, and body.
 * @returns Express RequestHandler middleware function.
 */
export function validateRequest<
    TParams extends z.ZodType = z.ZodType,
    TQuery extends z.ZodType = z.ZodType,
    TBody extends z.ZodType = z.ZodType
>(
    schemas: RequestValidationSchemas<TParams, TQuery, TBody>
): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (schemas.params) {
                const parsedParams = await schemas.params.parseAsync(req.params || {});
                Object.defineProperty(req, "params", {
                    value: Object.assign(req.params || {}, parsedParams),
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
            if (schemas.query) {
                const parsedQuery = await schemas.query.parseAsync(req.query || {});
                Object.defineProperty(req, "query", {
                    value: parsedQuery,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });
            }
            if (schemas.body) {
                const parsedBody = await schemas.body.parseAsync(req.body);
                req.body = parsedBody;
            }
            next();
        } catch (error: unknown) {
            const isZod = error instanceof ZodError || (typeof error === "object" && error !== null && (error as { name?: string }).name === "ZodError");
            if (isZod) {
                const issues = (error as ZodError).issues || [];
                const details: ValidationErrorDetail[] = issues.map((issue) => ({
                    field: issue.path.join(".") || "payload",
                    message: issue.message,
                }));
                const firstErrorMessage = details[0]?.message || "Request validation failed";
                res.status(400).json({
                    message: `Validation Error: ${firstErrorMessage}`,
                    code: "VALIDATION_ERROR",
                    errors: details,
                });
                return;
            }
            next(error);
        }
    };
}

export default validateRequest;
