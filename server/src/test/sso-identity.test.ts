/**
 * @module SSOIdentityTests
 *
 * Test suite verifying SSO claim normalization, account linking,
 * compound {ssoIssuer, ssoSubject} identity resolution, and tokenVersion revocation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";
import { normalizeClaims, resolveOrProvisionUser } from "../utils/ssoIdentity";
import User, { UserSchema } from "../models/User";
import Group from "../models/Group";
import config from "../config";
import { protect, invalidateUserCache, invalidateTokenCache } from "../middleware/authMiddleware";
import { generateToken } from "../utils/jwt";

describe("SSO Identity & Session Revocation Verification", () => {
    describe("1. Claim Normalization (ssoIdentity.normalizeClaims)", () => {
        it("should extract and trim ssoIssuer, ssoSubject, email, and displayName", () => {
            const rawClaims = {
                iss: "  https://identity.company.com/  ",
                sub: "  auth0|user_12345  ",
                email: "  ALICE@EXAMPLE.COM  ",
                name: "  Alice Doe  ",
                preferred_username: "alice_doe",
            };

            const identity = normalizeClaims(rawClaims);
            assert.equal(identity.ssoIssuer, "https://identity.company.com/");
            assert.equal(identity.ssoSubject, "auth0|user_12345");
            assert.equal(identity.email, "alice@example.com");
            assert.equal(identity.displayName, "Alice Doe");
        });

        it("should fall back to configured issuerUrl when iss claim is absent", () => {
            const rawClaims = {
                sub: "user_sub_999",
                email: "bob@example.com",
            };

            const identity = normalizeClaims(rawClaims, "https://fallback-issuer.com");
            assert.equal(identity.ssoIssuer, "https://fallback-issuer.com");
            assert.equal(identity.ssoSubject, "user_sub_999");
        });

        it("should synthesize synthetic local email when IdP omits email claim", () => {
            const rawClaims = {
                sub: "saml_john_doe",
                name: "John Doe",
                preferred_username: "johndoe",
            };

            const identity = normalizeClaims(rawClaims);
            assert.ok(identity.email.includes("@organization.local"));
        });
    });

    describe("2. Schema Index Verification", () => {
        it("should define a unique compound index on { ssoIssuer: 1, ssoSubject: 1 } with partialFilterExpression", () => {
            const indexes = UserSchema.indexes();
            const ssoIndex = indexes.find(([fields]) => {
                const f = fields as Record<string, number>;
                return f.ssoIssuer === 1 && f.ssoSubject === 1;
            });

            assert.ok(ssoIndex, "Compound index on { ssoIssuer: 1, ssoSubject: 1 } must exist");
            const options = ssoIndex[1] as { unique?: boolean; partialFilterExpression?: Record<string, unknown> };
            assert.equal(options.unique, true, "SSO compound index must be unique");
            assert.ok(options.partialFilterExpression, "SSO compound index must have partialFilterExpression");
            assert.deepEqual(options.partialFilterExpression.ssoIssuer, { $type: "string", $gt: "" });
            assert.deepEqual(options.partialFilterExpression.ssoSubject, { $type: "string", $gt: "" });
        });

        it("should default tokenVersion to 0 and require it on User schema", () => {
            const tokenVersionPath = UserSchema.path("tokenVersion");
            assert.ok(tokenVersionPath, "tokenVersion path must exist on User schema");
            assert.equal((tokenVersionPath as unknown as { defaultValue: number }).defaultValue, 0);
            assert.equal((tokenVersionPath as unknown as { isRequired: boolean }).isRequired, true);
        });
    });

    describe("3. Identity Resolution & Provisioning (ssoIdentity.resolveOrProvisionUser)", () => {
        it("should match existing user by exact { ssoIssuer, ssoSubject }", async () => {
            const mockUser = {
                _id: new mongoose.Types.ObjectId(),
                username: "alice",
                email: "alice@example.com",
                ssoIssuer: "https://idp.org",
                ssoSubject: "sub-123",
                isActive: true,
                groups: [],
                tokenVersion: 0,
                save: async () => mockUser,
            };

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindOne = userHolder.findOne;
            userHolder.findOne = async (query: Record<string, unknown>) => {
                if (query.ssoIssuer === "https://idp.org" && query.ssoSubject === "sub-123") {
                    return mockUser;
                }
                return null;
            };

            try {
                const resolved = await resolveOrProvisionUser({
                    iss: "https://idp.org",
                    sub: "sub-123",
                    email: "alice@example.com",
                });

                assert.equal(resolved._id, mockUser._id);
                assert.equal(resolved.username, "alice");
            } finally {
                userHolder.findOne = originalFindOne;
            }
        });

        it("should link unlinked legacy user by email match and persist ssoIssuer and ssoSubject", async () => {
            const legacyUser = {
                _id: new mongoose.Types.ObjectId(),
                username: "legacy_user",
                email: "legacy@example.com",
                ssoIssuer: undefined as string | undefined,
                ssoSubject: undefined as string | undefined,
                isActive: true,
                groups: [],
                tokenVersion: 0,
                save: async () => legacyUser,
            };

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindOne = userHolder.findOne;
            userHolder.findOne = async (query: Record<string, unknown>) => {
                if (query.email === "legacy@example.com") {
                    return legacyUser;
                }
                return null;
            };

            try {
                const resolved = await resolveOrProvisionUser({
                    iss: "https://new-idp.org",
                    sub: "new-sub-999",
                    email: "legacy@example.com",
                });

                assert.equal(resolved.ssoIssuer, "https://new-idp.org");
                assert.equal(resolved.ssoSubject, "new-sub-999");
            } finally {
                userHolder.findOne = originalFindOne;
            }
        });
    });

    describe("4. Session Invalidation via tokenVersion (authMiddleware.protect)", () => {
        it("should reject request with 401 TOKEN_REVOKED when tokenVersion mismatches DB version", async () => {
            invalidateUserCache();
            invalidateTokenCache();

            const userId = new mongoose.Types.ObjectId().toString();
            const userInDb = {
                _id: userId,
                username: "revokedUser",
                email: "revoked@example.com",
                isActive: true,
                tokenVersion: 2, // Incremented after logout or password reset
                groups: [],
            };

            // Token was issued with tokenVersion: 1
            const staleToken = generateToken({
                _id: userId,
                username: "revokedUser",
                email: "revoked@example.com",
                tokenVersion: 1,
            });

            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = () => ({
                populate: () => ({
                    lean: async () => userInDb,
                    then: (resolve: (val: unknown) => void) => resolve(userInDb),
                }),
            });

            try {
                const clearedCookies: string[] = [];
                let responseStatus = 0;
                let responseJson: Record<string, unknown> = {};

                const req = {
                    headers: {},
                    cookies: {
                        hunting_token: staleToken,
                    },
                } as unknown as Request;

                const res = {
                    status: (status: number) => {
                        responseStatus = status;
                        return res;
                    },
                    json: (data: Record<string, unknown>) => {
                        responseJson = data;
                        return res;
                    },
                    clearCookie: (name: string) => {
                        clearedCookies.push(name);
                    },
                } as unknown as Response;

                let nextCalled = false;
                await protect(req, res, () => {
                    nextCalled = true;
                });

                assert.equal(nextCalled, false, "protect must not call next() for revoked session");
                assert.equal(responseStatus, 401);
                assert.equal(responseJson.code, "TOKEN_REVOKED");
                assert.ok(clearedCookies.includes("hunting_token"), "Must clear hunting_token cookie");
                assert.ok(clearedCookies.includes("hunting_refresh_token"), "Must clear hunting_refresh_token cookie");
            } finally {
                userHolder.findById = originalFindById;
            }
        });
    });
});
