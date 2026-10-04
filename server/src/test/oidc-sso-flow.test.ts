/**
 * @module OidcSSOFlowTests
 *
 * Test suite verifying the 9-step OIDC code grant flow, PKCE generation,
 * state & nonce transient cookie issuance, CompanyTokenSet contract,
 * cookie-backed dual stack authMiddleware, silent refresh, and logout endpoints.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../../app";
import { generateToken } from "../utils/jwt";
import type { CompanyTokenSet } from "../types/auth";
import type { Request, Response } from "express";
import { protect, invalidateUserCache } from "../middleware/authMiddleware";
import User from "../models/User";

let server: http.Server;
let baseUrl: string;

before(async () => {
    await new Promise<void>((resolve) => {
        server = app.listen(0, () => {
            const addr = server.address();
            if (addr && typeof addr === "object") {
                baseUrl = `http://localhost:${addr.port}`;
            }
            resolve();
        });
    });
});

after(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
    });
});

describe("Enterprise 9-Step OIDC SSO Integration Test Suite", () => {
    describe("Step 2 & 3: Authorization URL & PKCE Transient Cookie (GET /api/auth/sso-url)", () => {
        it("should return SSO URL with PKCE parameters and set signed hunting_oidc_state cookie", async () => {
            const res = await fetch(`${baseUrl}/api/auth/sso-url`, {
                method: "GET",
            });

            assert.equal(res.status, 200, "Expected 200 OK from GET /api/auth/sso-url");

            const body = (await res.json()) as { url: string; state?: string };
            assert.ok(typeof body.url === "string", "Expected URL string in response");
            assert.ok(body.url.length > 0, "SSO URL must not be empty");

            // URL must include standard OIDC and PKCE parameters
            const parsedUrl = new URL(body.url);
            assert.ok(parsedUrl.searchParams.get("code_challenge"), "URL must contain code_challenge");
            assert.equal(parsedUrl.searchParams.get("code_challenge_method"), "S256", "PKCE method must be S256");
            assert.ok(parsedUrl.searchParams.get("state"), "URL must contain state parameter");
            assert.ok(parsedUrl.searchParams.get("nonce"), "URL must contain nonce parameter");
            assert.equal(parsedUrl.searchParams.get("response_type"), "code", "response_type must be code");

            // Verify Set-Cookie header for hunting_oidc_state
            const setCookie = res.headers.get("set-cookie");
            assert.ok(setCookie, "Response must include Set-Cookie header");
            assert.ok(setCookie.includes("hunting_oidc_state="), "Set-Cookie must contain hunting_oidc_state");
            assert.ok(setCookie.toLowerCase().includes("httponly"), "hunting_oidc_state cookie must be HttpOnly");
            assert.ok(setCookie.toLowerCase().includes("path=/api/auth"), "hunting_oidc_state cookie must be scoped to /api/auth");
            assert.ok(setCookie.toLowerCase().includes("samesite=lax"), "hunting_oidc_state cookie must be SameSite=Lax");
        });
    });

    describe("Step 7 & 8: Input Validation & CSRF State Mismatch (POST /api/auth/login)", () => {
        it("should reject payload without code parameter with 400 VALIDATION_ERROR", async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state: "some-state" }),
            });

            assert.equal(res.status, 400);
            const data = (await res.json()) as { code?: string; message?: string };
            assert.equal(data.code, "VALIDATION_ERROR");
        });

        it("should reject login when state parameter mismatches transient cookie", async () => {
            // First get a valid state cookie
            const ssoRes = await fetch(`${baseUrl}/api/auth/sso-url`);
            const cookieHeader = ssoRes.headers.get("set-cookie") || "";
            const oidcCookie = cookieHeader.split(";")[0]; // hunting_oidc_state=...

            // Attempt login with mismatched state
            const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: oidcCookie,
                },
                body: JSON.stringify({
                    code: "test-auth-code",
                    state: "completely-different-state",
                }),
            });

            assert.equal(loginRes.status, 401, "Expected 401 for mismatched state");
            const data = (await loginRes.json()) as { message?: string; error?: string };
            assert.ok(data.error?.includes("state parameter mismatch"), "Expected state mismatch error");
        });
    });

    describe("Boundary C: Silent Session Refresh (POST /api/auth/refresh)", () => {
        it("should return 401 NO_REFRESH_TOKEN when refresh token cookie is missing", async () => {
            const res = await fetch(`${baseUrl}/api/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            assert.equal(res.status, 401);
            const data = (await res.json()) as { code?: string; message?: string };
            assert.equal(data.code, "NO_REFRESH_TOKEN");
        });
    });

    describe("Boundary D: Session Termination (POST /api/auth/logout)", () => {
        it("should clear session cookies and return success message", async () => {
            const res = await fetch(`${baseUrl}/api/auth/logout`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            assert.equal(res.status, 200);
            const data = (await res.json()) as { success: boolean; message: string; logoutUrl?: string };
            assert.equal(data.success, true);
            assert.ok(data.message.includes("Logged out"));

            // Check that Set-Cookie expired hunting_token and hunting_refresh_token
            const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
            const cookieStr = cookies.join(" | ");
            assert.ok(cookieStr.includes("hunting_token="), "Must expire hunting_token cookie");
            assert.ok(cookieStr.includes("hunting_refresh_token="), "Must expire hunting_refresh_token cookie");
        });
    });

    describe("Step 6: Dual-Stack Auth Middleware (Cookie + Bearer fallback)", () => {
        it("should authenticate using hunting_token cookie without Bearer header", async () => {
            invalidateUserCache();
            const userId = "507f1f77bcf86cd799439011";
            const testUser = {
                _id: userId,
                username: "cookieUser",
                email: "cookie@example.com",
                isActive: true,
                groups: [],
            };
            const validToken = generateToken(testUser);

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = () => ({
                populate: () => ({
                    lean: async () => testUser,
                    then: (resolve: (val: unknown) => void) => resolve(testUser),
                }),
            });

            try {
                const req = {
                    headers: {},
                    cookies: {
                        hunting_token: validToken,
                    },
                } as unknown as Request;

                let nextCalled = false;
                const res = {
                    status: () => res,
                    json: () => {},
                } as unknown as Response;

                await protect(req, res, () => {
                    nextCalled = true;
                });

                assert.equal(nextCalled, true, "protect middleware must succeed with hunting_token cookie");
                assert.ok(req.user, "req.user must be populated");
                assert.equal(req.user?.username, "cookieUser");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("should fall back to Authorization: Bearer header when cookie is absent", async () => {
            invalidateUserCache();
            const userId = "507f1f77bcf86cd799439012";
            const testUser = {
                _id: userId,
                username: "bearerUser",
                email: "bearer@example.com",
                isActive: true,
                groups: [],
            };
            const validToken = generateToken(testUser);

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = () => ({
                populate: () => ({
                    lean: async () => testUser,
                    then: (resolve: (val: unknown) => void) => resolve(testUser),
                }),
            });

            try {
                const req = {
                    headers: {
                        authorization: `Bearer ${validToken}`,
                    },
                    cookies: {},
                } as unknown as Request;

                let nextCalled = false;
                const res = {
                    status: () => res,
                    json: () => {},
                } as unknown as Response;

                await protect(req, res, () => {
                    nextCalled = true;
                });

                assert.equal(nextCalled, true, "protect middleware must succeed with Bearer header fallback");
                assert.ok(req.user, "req.user must be populated");
                assert.equal(req.user?.username, "bearerUser");
            } finally {
                userHolder.findById = originalFindById;
            }
        });
    });

    describe("Company TokenSet Contract Compliance", () => {
        it("should strictly adhere to the 9-property CompanyTokenSet interface", () => {
            const validTokenSet: CompanyTokenSet = {
                access_token: "mock-access-token-12345",
                id_token: "mock-id-token-jwt",
                refresh_token: "mock-refresh-token",
                expires_in: 3600,
                refresh_expires_in: 2592000,
                session_state: "session-abc-123",
                scope: "openid profile email",
                "not-before-policy": 1700000000,
                token_type: "Bearer",
            };

            assert.equal(validTokenSet.access_token, "mock-access-token-12345");
            assert.equal(validTokenSet.id_token, "mock-id-token-jwt");
            assert.equal(validTokenSet.refresh_token, "mock-refresh-token");
            assert.equal(validTokenSet.expires_in, 3600);
            assert.equal(validTokenSet.refresh_expires_in, 2592000);
            assert.equal(validTokenSet.session_state, "session-abc-123");
            assert.equal(validTokenSet.scope, "openid profile email");
            assert.equal(validTokenSet["not-before-policy"], 1700000000);
            assert.equal(validTokenSet.token_type, "Bearer");
        });
    });
});
