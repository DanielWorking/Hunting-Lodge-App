import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import config from "../config";
import User from "../models/User";

import {
    protect,
    invalidateUserCache,
    requireAdmin,
    requireGroupMember,
    requireShiftManager,
} from "../middleware/authMiddleware";

import { notFoundHandler, errorHandler, createErrorHandler } from "../middleware/errorMiddleware";
import { stripImmutableFields, sanitizePayload, IMMUTABLE_SSO_FIELDS } from "../middleware/sanitizationMiddleware";

interface MockJsonPayload {
    code?: string;
    message?: string;
    stack?: unknown;
    [key: string]: unknown;
}

interface MockResponse {
    statusCode: number | null;
    jsonPayload: MockJsonPayload | null;
    headersSent?: boolean;
    status: (code: number) => MockResponse;
    json: (payload: MockJsonPayload) => void;
}

function createMockResponse(headersSent = false): MockResponse {
    const res: MockResponse = {
        statusCode: null,
        jsonPayload: null,
        headersSent,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: MockJsonPayload) {
            this.jsonPayload = payload;
        },
    };
    return res;
}

describe("Migrated TypeScript Middleware Suite", () => {
    describe("authMiddleware.ts", () => {
        beforeEach(() => {
            invalidateUserCache();
        });

        it("protect should reject requests without a session cookie with 401 NO_TOKEN", async () => {
            const req = { headers: {} } as unknown as Request;
            const res = createMockResponse();
            let nextCalled = false;

            await protect(req, res as unknown as Response, () => {
                nextCalled = true;
            });

            assert.equal(res.statusCode, 401);
            assert.equal(res.jsonPayload?.code, "NO_TOKEN");
            assert.equal(nextCalled, false);
        });

        it("protect ignores an Authorization: Bearer header, since sessions are cookie-only (401 NO_TOKEN)", async () => {
            const validToken = jwt.sign(
                { userId: "507f1f77bcf86cd799439010", username: "bearerUser", tokenVersion: 0 },
                config.jwt.secret,
                { expiresIn: "1h" }
            );
            const req = { headers: { authorization: "Bearer " + validToken } } as unknown as Request;
            const res = createMockResponse();

            await protect(req, res as unknown as Response, () => {});

            assert.equal(res.statusCode, 401);
            assert.equal(res.jsonPayload?.code, "NO_TOKEN");
        });

        it("protect should reject expired JWT tokens with 401 TOKEN_EXPIRED", async () => {
            const expiredToken = jwt.sign(
                { userId: "507f1f77bcf86cd799439011", username: "expiredUser" },
                config.jwt.secret,
                { expiresIn: -10 }
            );

            const req = { cookies: { hunting_token: expiredToken } } as unknown as Request;
            const res = createMockResponse();

            await protect(req, res as unknown as Response, () => {});

            assert.equal(res.statusCode, 401);
            assert.equal(res.jsonPayload?.code, "TOKEN_EXPIRED");
        });

        it("protect should reject tokens with invalid signature with 401 INVALID_TOKEN", async () => {
            const forgedToken = jwt.sign(
                { userId: "507f1f77bcf86cd799439011", username: "forged" },
                "wrong-secret-key"
            );

            const req = { cookies: { hunting_token: forgedToken } } as unknown as Request;
            const res = createMockResponse();

            await protect(req, res as unknown as Response, () => {});

            assert.equal(res.statusCode, 401);
            assert.equal(res.jsonPayload?.code, "INVALID_TOKEN");
        });

        it("protect should reject if user is not found or inactive in database", async () => {
            const validToken = jwt.sign(
                { userId: "507f1f77bcf86cd799439012", username: "inactive", tokenVersion: 0 },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const req = { cookies: { hunting_token: validToken } } as unknown as Request;
            const res = createMockResponse();

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = () => ({
                populate: async () => ({ _id: "507f1f77bcf86cd799439012", isActive: false }),
            });

            try {
                await protect(req, res as unknown as Response, () => {});
                assert.equal(res.statusCode, 401);
                assert.equal(res.jsonPayload?.code, "USER_INACTIVE");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("protect should attach active user and decoded claims to req and utilize cache", async () => {
            const userId = "507f1f77bcf86cd799439013";
            const validToken = jwt.sign(
                { userId, username: "validUser", tokenVersion: 0 },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const req1 = { cookies: { hunting_token: validToken } } as unknown as Request;
            let next1Called = false;
            let dbHits = 0;

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = (id: string) => {
                dbHits++;
                return {
                    populate: async () => ({
                        _id: id,
                        username: "validUser",
                        isActive: true,
                        groups: [],
                    }),
                };
            };

            try {
                await protect(req1, {} as Response, () => {
                    next1Called = true;
                });
                assert.equal(next1Called, true);
                assert.ok(req1.user);
                assert.equal(req1.user.username, "validUser");
                assert.equal(req1.auth?.userId, userId);
                assert.equal(dbHits, 1, "First invocation hits the DB");

                // Second invocation should use in-memory cache
                const req2 = { cookies: { hunting_token: validToken } } as unknown as Request;
                let next2Called = false;
                await protect(req2, {} as Response, () => {
                    next2Called = true;
                });
                assert.equal(next2Called, true);
                assert.equal(dbHits, 1, "Second invocation utilizes session cache without re-querying DB");

                // Test cache invalidation
                invalidateUserCache(userId);
                const req3 = { cookies: { hunting_token: validToken } } as unknown as Request;
                await protect(req3, {} as Response, () => {});
                assert.equal(dbHits, 2, "After cache invalidation, DB is queried again");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("protect should forward unexpected database errors to next(err) without swallowing", async () => {
            const validToken = jwt.sign(
                { userId: "507f1f77bcf86cd799439014", username: "dbCrash", tokenVersion: 0 },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const req = { cookies: { hunting_token: validToken } } as unknown as Request;
            let nextError: Error | null = null;

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = () => ({
                populate: async () => {
                    throw new Error("Simulated DB Connection Crash");
                },
            });

            try {
                await protect(req, {} as Response, (err?: unknown) => {
                    nextError = err as Error;
                });
                assert.ok(nextError, "next(err) must be called on catch");
                assert.equal((nextError as Error).message, "Simulated DB Connection Crash");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("requireAdmin should allow admin and reject non-admin", () => {
            let nextCalled = false;
            const res = createMockResponse();

            // Non-admin
            const reqUser = { user: { username: "regularGuy", groups: [] } } as unknown as Request;
            requireAdmin(reqUser, res as unknown as Response, () => {
                nextCalled = true;
            });
            assert.equal(nextCalled, false);
            assert.equal(res.statusCode, 403);
            assert.equal(res.jsonPayload?.code, "FORBIDDEN_ADMIN_REQUIRED");

            // Super Admin
            let adminNext = false;
            const reqAdmin = { user: { username: config.superAdmin.username, groups: [] } } as unknown as Request;
            requireAdmin(reqAdmin, res as unknown as Response, () => {
                adminNext = true;
            });
            assert.equal(adminNext, true);
        });

        it("requireGroupMember should forward exceptions to next(err)", async () => {
            const middleware = requireGroupMember(() => {
                throw new Error("Extractor failure");
            });

            let errorCaptured: Error | null = null;
            await middleware({} as Request, {} as Response, ((err?: unknown) => {
                errorCaptured = err as Error;
            }) as NextFunction);

            assert.ok(errorCaptured);
            assert.equal((errorCaptured as Error).message, "Extractor failure");
        });

        it("requireShiftManager should forward exceptions to next(err)", async () => {
            const middleware = requireShiftManager(() => {
                throw new Error("Shift manager check failure");
            });

            let errorCaptured: Error | null = null;
            await middleware({} as Request, {} as Response, ((err?: unknown) => {
                errorCaptured = err as Error;
            }) as NextFunction);

            assert.ok(errorCaptured);
            assert.equal((errorCaptured as Error).message, "Shift manager check failure");
        });
    });

    describe("errorMiddleware.ts", () => {
        it("notFoundHandler should create a 404 error and pass to next(err)", () => {
            const req = { method: "GET", originalUrl: "/api/unknown-endpoint" } as unknown as Request;
            let statusSet: number | null = null;
            let passedErr: unknown = null;

            const res = {
                status: (code: number) => {
                    statusSet = code;
                    return res;
                },
            } as unknown as Response;

            notFoundHandler(req, res, ((err?: unknown) => {
                passedErr = err;
            }) as NextFunction);

            assert.equal(statusSet, 404);
            assert.ok(passedErr instanceof Error);
            const errWithCode = passedErr as Error & { code?: string };
            assert.equal(errWithCode.code, "NOT_FOUND");
            assert.ok(errWithCode.message.includes("/api/unknown-endpoint"));
        });

        it("errorHandler should bypass execution if res.headersSent is true", () => {
            let nextCalledWith: unknown = null;
            const err = new Error("Test");
            const res = { headersSent: true } as unknown as Response;

            errorHandler(err, {} as Request, res, ((passed?: unknown) => {
                nextCalledWith = passed;
            }) as NextFunction);

            assert.equal(nextCalledWith, err);
        });

        it("errorHandler should handle SyntaxError 400 from express.json()", () => {
            const syntaxErr = new SyntaxError("Unexpected token in JSON") as SyntaxError & {
                status?: number;
                body?: string;
            };
            syntaxErr.status = 400;
            syntaxErr.body = "{\"bad\":";

            const res = createMockResponse();

            errorHandler(syntaxErr, { method: "POST", originalUrl: "/api/test" } as unknown as Request, res as unknown as Response, () => {});

            assert.equal(res.statusCode, 400);
            assert.equal(res.jsonPayload?.code, "INVALID_JSON");
            assert.equal(res.jsonPayload?.message, "Invalid JSON payload in request body");
        });

        it("errorHandler should handle CastError and ValidationError", () => {
            const castErr = new Error("Cast error") as Error & {
                name: string;
                path?: string;
                value?: string;
            };
            castErr.name = "CastError";
            castErr.path = "groupId";
            castErr.value = "invalidId";

            const res = createMockResponse();

            errorHandler(castErr, { method: "GET", originalUrl: "/api/groups/bad" } as unknown as Request, res as unknown as Response, () => {});

            assert.equal(res.statusCode, 400);
            assert.equal(res.jsonPayload?.code, "INVALID_IDENTIFIER");
            assert.ok(res.jsonPayload?.message?.includes("groupId"));
        });

        it("errorHandler should handle generic 500 errors and never send a stack trace, in any mode", () => {
            const genericErr = new Error("Critical database failure");
            const res = createMockResponse();

            const envHolder = process.env as Record<string, string | undefined>;
            const originalEnv = envHolder.NODE_ENV;
            try {
                // In production mode
                envHolder.NODE_ENV = "production";
                errorHandler(genericErr, { method: "GET", originalUrl: "/api/crash" } as unknown as Request, res as unknown as Response, () => {});
                assert.equal(res.statusCode, 500);
                assert.equal(res.jsonPayload?.code, "INTERNAL_ERROR");
                assert.equal(res.jsonPayload?.stack, undefined, "Stack trace must not leak in production");

                // In development mode
                envHolder.NODE_ENV = "development";
                const devRes = createMockResponse();
                errorHandler(genericErr, { method: "GET", originalUrl: "/api/crash" } as unknown as Request, devRes as unknown as Response, () => {});
                assert.equal(devRes.jsonPayload?.stack, undefined, "Non-production behaves like production: no stack trace");
                assert.equal(devRes.jsonPayload?.details, undefined, "No details unless EXPOSE_ERROR_DETAILS is on");
            } finally {
                envHolder.NODE_ENV = originalEnv;
            }
        });

        it("adds details { name, message, stack } to 5xx bodies when error details are on, keeping the generic contract", () => {
            const res = createMockResponse();
            createErrorHandler({ exposeErrorDetails: true })(
                new TypeError("Cannot read properties of undefined"),
                { method: "GET", originalUrl: "/api/crash" } as unknown as Request,
                res as unknown as Response,
                () => {},
            );

            assert.equal(res.statusCode, 500);
            assert.equal(res.jsonPayload?.message, "Internal server error");
            assert.equal(res.jsonPayload?.code, "INTERNAL_ERROR");
            const details = res.jsonPayload?.details as { name: string; message: string; stack?: string };
            assert.equal(details.name, "TypeError");
            assert.equal(details.message, "Cannot read properties of undefined");
            assert.match(String(details.stack), /TypeError/);
        });

        it("never adds details to 4xx bodies, even when error details are on", () => {
            const res = createMockResponse();
            const notAllowed = Object.assign(new Error("Origin not allowed"), { statusCode: 403, code: "CORS_ORIGIN_REJECTED" });
            createErrorHandler({ exposeErrorDetails: true })(
                notAllowed,
                { method: "GET", originalUrl: "/api/sites" } as unknown as Request,
                res as unknown as Response,
                () => {},
            );

            assert.equal(res.statusCode, 403);
            assert.equal(res.jsonPayload?.details, undefined);
        });
    });

    describe("sanitizationMiddleware.ts", () => {
        it("stripImmutableFields strips SSO identity fields on write verbs", () => {
            const req = {
                method: "POST",
                body: {
                    displayName: "Admin",
                    ssoIssuer: "https://idp.example.com",
                    ssoSubject: "sso-123",
                    allowedField: "safe value",
                },
            } as unknown as Request;

            let nextCalled = false;
            stripImmutableFields(req, {} as Response, () => {
                nextCalled = true;
            });

            assert.equal(nextCalled, true);
            const body = req.body as Record<string, unknown>;
            assert.equal(body.displayName, undefined);
            assert.equal(body.ssoIssuer, undefined);
            assert.equal(body.ssoSubject, undefined);
            assert.equal(body.allowedField, "safe value");
        });

        it("stripImmutableFields does not alter body on GET or non-write requests", () => {
            const req = {
                method: "GET",
                body: {
                    displayName: "Should Not Be Touched",
                },
            } as unknown as Request;

            stripImmutableFields(req, {} as Response, () => {});
            const body = req.body as Record<string, unknown>;
            assert.equal(body.displayName, "Should Not Be Touched");
        });

        it("sanitizePayload handles primitive and edge cases gracefully", () => {
            assert.doesNotThrow(() => sanitizePayload(null));
            assert.doesNotThrow(() => sanitizePayload(undefined));
            assert.doesNotThrow(() => sanitizePayload("string"));
            assert.doesNotThrow(() => sanitizePayload(12345));

            assert.ok(IMMUTABLE_SSO_FIELDS.includes("displayName"));
            assert.ok(IMMUTABLE_SSO_FIELDS.includes("ssoIssuer"));
            assert.ok(IMMUTABLE_SSO_FIELDS.includes("ssoSubject"));
            assert.ok(IMMUTABLE_SSO_FIELDS.includes("tokenVersion"));
        });
    });
});
