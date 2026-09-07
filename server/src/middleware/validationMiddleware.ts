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
