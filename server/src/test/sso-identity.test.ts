/**
 * @module SSOIdentityTests
 *
 * Test suite verifying SSO claim normalization, compound {ssoIssuer, ssoSubject} identity
 * resolution, Super Admin provisioning, and tokenVersion revocation.
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
import { getAdminGroupId } from "../services/adminGroup";
import { ADMIN_GROUP_ID, registerAdminGroup, stubAdminGroupInDb } from "./adminGroupFixture";

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

            const identity = normalizeClaims(rawClaims, undefined, "username");
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

        const allClaims = {
            sub: "auth0|abc",
            email: "Dana.Levi@Example.com",
            preferred_username: "dlevi",
            username: "dana_l",
            name: "Dana Levi",
            nickname: "dana",
            given_name: "Dana",
        };
        const without = (...keys: Array<keyof typeof allClaims>) =>
            Object.fromEntries(Object.entries(allClaims).filter(([key]) => !keys.includes(key as keyof typeof allClaims)));

        it("email mode: System ID is the email, then the name, then the subject", () => {
            assert.equal(normalizeClaims(allClaims, undefined, "email").username, "dana.levi@example.com");
            assert.equal(normalizeClaims(without("email"), undefined, "email").username, "Dana Levi");
            assert.equal(normalizeClaims(without("email", "name"), undefined, "email").username, "auth0|abc");
        });

        it("username mode: System ID is preferred_username, then the email, then the subject", () => {
            assert.equal(normalizeClaims(allClaims, undefined, "username").username, "dlevi");
            assert.equal(normalizeClaims(without("preferred_username"), undefined, "username").username, "dana.levi@example.com");
            assert.equal(normalizeClaims(without("preferred_username", "email"), undefined, "username").username, "auth0|abc");
        });

        it("email mode: Name is the username claim, then nickname, then the System ID (name and given_name unused)", () => {
            assert.equal(normalizeClaims(allClaims, undefined, "email").displayName, "dana_l");
            assert.equal(normalizeClaims(without("username"), undefined, "email").displayName, "dana");
            assert.equal(normalizeClaims(without("username", "nickname"), undefined, "email").displayName, "dana.levi@example.com");
        });

        it("username mode: Name is name, then given_name, then the System ID (username and nickname unused)", () => {
            assert.equal(normalizeClaims(allClaims, undefined, "username").displayName, "Dana Levi");
            assert.equal(normalizeClaims(without("name"), undefined, "username").displayName, "Dana");
            assert.equal(normalizeClaims(without("name", "given_name"), undefined, "username").displayName, "dlevi");
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

        it("never takes over an existing account by email or username: a new SSO identity gets its own account", async () => {
            const accountWithoutSso = {
                _id: new mongoose.Types.ObjectId(),
                username: "dana",
                email: "dana@example.com",
                ssoIssuer: undefined as string | undefined,
                ssoSubject: undefined as string | undefined,
                isActive: true,
                groups: [],
                tokenVersion: 0,
                save: async () => accountWithoutSso,
            };

            const userHolder = User as unknown as Record<string, unknown>;
            const prototypeHolder = User.prototype as unknown as Record<string, unknown>;
            const originalFindOne = userHolder.findOne;
            const originalSave = prototypeHolder.save;
            userHolder.findOne = async (query: Record<string, unknown>) =>
                query.email === "dana@example.com" || query.username === "dana" ? accountWithoutSso : null;
            prototypeHolder.save = async function (this: unknown) {
                return this;
            };

            try {
                const resolved = await resolveOrProvisionUser({
                    iss: "https://idp.org",
                    sub: "sub-456",
                    email: "dana@example.com",
                    preferred_username: "dana",
                });

                assert.notEqual(String(resolved._id), String(accountWithoutSso._id), "a new account is created");
                assert.equal(resolved.ssoSubject, "sub-456");
                assert.equal(accountWithoutSso.ssoIssuer, undefined, "the existing account is left untouched");
                assert.equal(accountWithoutSso.ssoSubject, undefined);
            } finally {
                userHolder.findOne = originalFindOne;
                prototypeHolder.save = originalSave;
            }
        });

        it(
            "provisions the Super Admin into the administrators group at first login",
            { skip: !config.superAdmin.id && "SUPER_ADMIN_ID is not configured" },
            async () => {
                // The server learned the administrators group's id at startup
                await registerAdminGroup();
                const groupMemberUpdates: unknown[] = [];

                const userHolder = User as unknown as Record<string, unknown>;
                const groupHolder = Group as unknown as Record<string, unknown>;
                const prototypeHolder = User.prototype as unknown as Record<string, unknown>;
                const originals = {
                    findOne: userHolder.findOne,
                    groupUpdateOne: groupHolder.updateOne,
                    save: prototypeHolder.save,
                };
                // Nothing seeded: the Super Admin has no account yet
                userHolder.findOne = async () => null;
                groupHolder.updateOne = async (filter: unknown, update: unknown) => {
                    groupMemberUpdates.push({ filter, update });
                };
                prototypeHolder.save = async function (this: unknown) {
                    return this;
                };
                const restoreAdminGroup = stubAdminGroupInDb();

                try {
                    // SUPER_ADMIN_ID becomes the System ID in either SSO_IDENTIFIER_FIELD mode
                    const resolved = await resolveOrProvisionUser({
                        iss: "https://idp.org",
                        sub: "sub-admin",
                        preferred_username: config.superAdmin.id,
                        email: config.superAdmin.id,
                    });

                    assert.equal(resolved.isNew, true, "the account is created at first login");
                    assert.equal(resolved.ssoSubject, "sub-admin");
                    assert.deepEqual(
                        resolved.groups.map((g) => ({ groupId: String(g.groupId), role: g.role })),
                        [{ groupId: ADMIN_GROUP_ID, role: "shift_manager" }],
                    );
                    assert.deepEqual(groupMemberUpdates, [
                        { filter: { _id: ADMIN_GROUP_ID }, update: { $addToSet: { members: resolved._id } } },
                    ]);
                } finally {
                    restoreAdminGroup();
                    userHolder.findOne = originals.findOne;
                    groupHolder.updateOne = originals.groupUpdateOne;
                    prototypeHolder.save = originals.save;
                }
            },
        );

        it(
            "adds the Super Admin to the administrators group as it exists now, after it was recreated under a new id",
            { skip: !config.superAdmin.id && "SUPER_ADMIN_ID is not configured" },
            async () => {
                // At startup the server learned ADMIN_GROUP_ID; since then a wiping seed recreated the group
                await registerAdminGroup();
                const recreatedGroupId = new mongoose.Types.ObjectId().toString();
                const superAdmin = new User({
                    username: config.superAdmin.id,
                    email: config.superAdmin.id,
                    ssoIssuer: "https://idp.org",
                    ssoSubject: "sub-admin",
                    groups: [{ groupId: new mongoose.Types.ObjectId(ADMIN_GROUP_ID), role: "shift_manager", order: 0 }],
                });
                const groupMemberUpdates: unknown[] = [];

                const userHolder = User as unknown as Record<string, unknown>;
                const groupHolder = Group as unknown as Record<string, unknown>;
                const prototypeHolder = User.prototype as unknown as Record<string, unknown>;
                const originals = {
                    findOne: userHolder.findOne,
                    groupDistinct: groupHolder.distinct,
                    groupUpdateOne: groupHolder.updateOne,
                    save: prototypeHolder.save,
                };
                userHolder.findOne = async () => superAdmin;
                // The group the membership names is gone
                groupHolder.distinct = async () => [];
                groupHolder.updateOne = async (filter: unknown, update: unknown) => {
                    groupMemberUpdates.push({ filter, update });
                };
                prototypeHolder.save = async function (this: unknown) {
                    return this;
                };
                const restoreAdminGroup = stubAdminGroupInDb(recreatedGroupId);

                try {
                    const resolved = await resolveOrProvisionUser({
                        iss: "https://idp.org",
                        sub: "sub-admin",
                        preferred_username: config.superAdmin.id,
                        email: config.superAdmin.id,
                    });

                    assert.deepEqual(
                        resolved.groups.map((g) => ({ groupId: String(g.groupId), role: g.role })),
                        [{ groupId: recreatedGroupId, role: "shift_manager" }],
                        "the membership of the deleted group is replaced by the live one",
                    );
                    assert.equal(getAdminGroupId(), recreatedGroupId, "every later administrator check uses the live id");
                    assert.deepEqual(groupMemberUpdates, [
                        { filter: { _id: recreatedGroupId }, update: { $addToSet: { members: resolved._id } } },
                    ]);
                } finally {
                    restoreAdminGroup();
                    userHolder.findOne = originals.findOne;
                    groupHolder.distinct = originals.groupDistinct;
                    groupHolder.updateOne = originals.groupUpdateOne;
                    prototypeHolder.save = originals.save;
                    await registerAdminGroup();
                }
            },
        );

        it("drops memberships of groups that no longer exist at login", async () => {
            const deletedGroupId = new mongoose.Types.ObjectId();
            const liveGroupId = new mongoose.Types.ObjectId();
            const member = new User({
                username: "dana",
                email: "dana@example.com",
                ssoIssuer: "https://idp.org",
                ssoSubject: "sub-dana",
                groups: [
                    { groupId: deletedGroupId, role: "shift_manager", order: 0 },
                    { groupId: liveGroupId, role: "member", order: 1 },
                ],
            });
            const groupQueries: unknown[] = [];

            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;
            const prototypeHolder = User.prototype as unknown as Record<string, unknown>;
            const originals = { findOne: userHolder.findOne, groupDistinct: groupHolder.distinct, save: prototypeHolder.save };
            userHolder.findOne = async () => member;
            groupHolder.distinct = async (field: string, filter: unknown) => {
                groupQueries.push({ field, filter });
                return [liveGroupId];
            };
            prototypeHolder.save = async function (this: unknown) {
                return this;
            };

            try {
                const resolved = await resolveOrProvisionUser({ iss: "https://idp.org", sub: "sub-dana", email: "dana@example.com" });

                assert.deepEqual(groupQueries, [
                    { field: "_id", filter: { _id: { $in: [String(deletedGroupId), String(liveGroupId)] } } },
                ]);
                assert.deepEqual(
                    resolved.groups.map((g) => ({ groupId: String(g.groupId), role: g.role })),
                    [{ groupId: String(liveGroupId), role: "member" }],
                );
            } finally {
                userHolder.findOne = originals.findOne;
                groupHolder.distinct = originals.groupDistinct;
                prototypeHolder.save = originals.save;
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
