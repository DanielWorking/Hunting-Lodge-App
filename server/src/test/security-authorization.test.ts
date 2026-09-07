import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import config from "../config";
import User from "../models/User";
import Group from "../models/Group";
import * as usersController from "../controllers/usersController";
import * as authHelpers from "../utils/authHelpers";
import * as sanitizationMiddleware from "../middleware/sanitizationMiddleware";

interface MockRes {
    statusCode: number;
    jsonData: Record<string, unknown> | null;
    status: (code: number) => MockRes;
    json: (data: Record<string, unknown>) => void;
}

function createMockRes(): MockRes {
    const res: MockRes = {
        statusCode: 200,
        jsonData: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: Record<string, unknown>) {
            this.jsonData = data;
        },
    };
    return res;
}

interface MockUserDoc {
    _id: mongoose.Types.ObjectId;
    username: string;
    displayName?: string;
    vacationBalance?: number;
    email?: string;
    groups?: Array<{ groupId: string | mongoose.Types.ObjectId; role?: string; order?: number }>;
    isActive?: boolean;
    save?: (this: MockUserDoc) => Promise<MockUserDoc>;
}

describe("Security Authorization Gates & Input Sanitization", () => {
    describe("AC-1: SSO Field Immutability (Display Name)", () => {
        it("AC-1a: usersController.updateUser must strip or reject displayName so it is never updated in MongoDB", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const originalFindByIdAndUpdate = userHolder.findByIdAndUpdate;

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "testuser",
                displayName: "Original SSO Name",
                email: "test@example.com",
                groups: [],
            });

            userHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>
            ) => {
                capturedUpdate = update;
                return {
                    _id: id,
                    username: "testuser",
                    displayName: "Original SSO Name",
                    email: "updated@example.com",
                    groups: [],
                };
            };

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: targetUserId.toString() },
                body: {
                    displayName: "Hacked Display Name",
                    email: "updated@example.com",
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                // Either displayName is stripped from $set or request is rejected with 400 Bad Request
                if (res.statusCode === 200) {
                    assert.ok(capturedUpdate, "update must be captured");
                    const update = capturedUpdate as Record<string, Record<string, unknown>>;
                    assert.equal(
                        update.$set?.displayName,
                        undefined,
                        "displayName must NOT be included in database update payload",
                    );
                } else {
                    assert.equal(res.statusCode, 400);
                }
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("AC-1b: usersController.managerUpdate must strip or ignore displayName", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            let savedUser: MockUserDoc | null = null;

            const targetUserDoc: MockUserDoc = {
                _id: targetUserId,
                username: "groupmember",
                displayName: "SSO Original Name",
                vacationBalance: 10,
                groups: [{ groupId: groupId.toString(), role: "member" }],
                save: async function (this: MockUserDoc) {
                    savedUser = this;
                    return this;
                },
            };

            userHolder.findById = async () => targetUserDoc;

            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: "shiftmgr",
                    groups: [{ groupId: groupId.toString(), role: "shift_manager" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    displayName: "Manager Injected Name",
                    vacationBalance: 12,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                assert.ok(savedUser, "savedUser must be captured");
                const userDoc = savedUser as MockUserDoc;
                assert.equal(userDoc.displayName, "SSO Original Name", "displayName must remain unchanged");
                assert.equal(userDoc.vacationBalance, 12);
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("AC-1c: stripImmutableFields middleware removes displayName and SSO identifiers from req.body", () => {
            assert.ok(sanitizationMiddleware, "sanitizationMiddleware module must exist");
            assert.ok(
                typeof sanitizationMiddleware.stripImmutableFields === "function",
                "stripImmutableFields must be exported as a middleware function",
            );

            const req = {
                method: "PUT",
                body: {
                    displayName: "Evil Name",
                    sub: "sso-sub-123",
                    oidcId: "oidc-456",
                    email: "legit@example.com",
                    isActive: true,
                },
            } as unknown as Request;
            const res = {} as Response;
            let nextCalled = false;

            sanitizationMiddleware.stripImmutableFields(req, res, () => {
                nextCalled = true;
            });

            assert.ok(nextCalled, "next() must be called");
            const body = req.body as Record<string, unknown>;
            assert.equal(body.displayName, undefined, "displayName must be stripped");
            assert.equal(body.sub, undefined, "sub must be stripped");
            assert.equal(body.oidcId, undefined, "oidcId must be stripped");
            assert.equal(body.email, "legit@example.com", "Legitimate fields must be preserved");
            assert.equal(body.isActive, true);
        });
    });

    describe("AC-2: Admin User-Management Boundary & Group Role Management (PUT /api/users/:id)", () => {
        it("AC-2a: should strip/ignore vacationBalance and displayName when Admin updates user on /api/users/:id", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const originalFindByIdAndUpdate = userHolder.findByIdAndUpdate;

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "regularuser",
                displayName: "SSO Original Name",
                vacationBalance: 18,
                groups: [],
            });

            userHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>
            ) => {
                capturedUpdate = update;
                return {
                    _id: id,
                    username: "regularuser",
                    displayName: "SSO Original Name",
                    vacationBalance: 18,
                    email: "updated@example.com",
                    groups: [],
                };
            };

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: targetUserId.toString() },
                body: {
                    displayName: "Attempted Name Change",
                    vacationBalance: 999,
                    vacationDays: 999,
                    email: "updated@example.com",
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                assert.ok(capturedUpdate, "update must be captured");
                const update = capturedUpdate as Record<string, Record<string, unknown>>;
                assert.equal(update.$set?.email, "updated@example.com");
                assert.equal(update.$set?.displayName, undefined, "displayName must be excluded from $set");
                assert.equal(update.$set?.vacationBalance, undefined, "vacationBalance must be excluded from $set");
                assert.equal(update.$set?.vacationDays, undefined, "vacationDays must be excluded from $set");
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("AC-2b: should allow Administrator to add a user to a group and grant shift_manager role", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const targetGroupId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const originalFindById = userHolder.findById;
            const originalFindByIdAndUpdate = userHolder.findByIdAndUpdate;
            const originalGroupUpdateMany = groupHolder.updateMany;

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;
            let groupMembersUpdated = false;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "regularuser",
                groups: [],
            });

            userHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>
            ) => {
                capturedUpdate = update;
                return {
                    _id: id,
                    username: "regularuser",
                    groups: [{ groupId: targetGroupId, role: "shift_manager", order: 0 }],
                };
            };

            groupHolder.updateMany = async (
                filter: { _id?: { $in?: unknown[] } },
                update: { $addToSet?: { members?: unknown } }
            ) => {
                if (filter._id?.$in && update.$addToSet?.members) {
                    groupMembersUpdated = true;
                }
            };

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: targetUserId.toString() },
                body: {
                    groups: [{ groupId: targetGroupId.toString(), role: "shift_manager", order: 0 }],
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                assert.ok(capturedUpdate, "update must be captured");
                const update = capturedUpdate as Record<string, Record<string, unknown>>;
                assert.deepEqual(update.$set?.groups, [
                    { groupId: targetGroupId.toString(), role: "shift_manager", order: 0 },
                ]);
                assert.ok(groupMembersUpdated, "Target group members must be updated with the user");
                const json = res.jsonData as Record<string, Array<{ role?: string }>> | null;
                assert.equal(json?.groups?.[0]?.role, "shift_manager");
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
                groupHolder.updateMany = originalGroupUpdateMany;
            }
        });

        it("AC-2c: should allow Administrator to update permitted profile fields on /api/users/:id", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const originalFindByIdAndUpdate = userHolder.findByIdAndUpdate;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "regularuser",
                groups: [],
            });

            userHolder.findByIdAndUpdate = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "regularuser",
                email: "newemail@example.com",
                isActive: false,
                groups: [],
            });

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: targetUserId.toString() },
                body: {
                    email: "newemail@example.com",
                    isActive: false,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.email, "newemail@example.com");
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });
    });

    describe("AC-3 & AC-4: Group-Settings Tenancy Check (PATCH /api/users/:id/manager-update)", () => {
        it("AC-3a: should return 403 Forbidden when Shift Manager attempts to update vacation for a user in a different group", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupAlphaId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            userHolder.findById = async () => ({
                _id: targetUserId,
                username: "beta_member",
                groups: [{ groupId: groupBetaId.toString(), role: "member" }],
            });

            // Requester is Shift Manager of Group Alpha only
            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: "alpha_manager",
                    groups: [{ groupId: groupAlphaId.toString(), role: "shift_manager" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    vacationBalance: 10,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(
                    res.statusCode,
                    403,
                    "Shift Manager of disjoint group must be rejected with 403 Forbidden",
                );
                const json = res.jsonData as Record<string, unknown> | null;
                assert.ok(
                    json?.code === "FORBIDDEN_MANAGER_REQUIRED" || json?.code === "FORBIDDEN_TENANCY_MISMATCH",
                );
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("AC-3b: should return 403 Forbidden when generic Administrator attempts to modify vacationBalance without group Shift Manager role", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            userHolder.findById = async () => ({
                _id: targetUserId,
                username: "beta_member",
                groups: [{ groupId: groupBetaId.toString(), role: "member" }],
            });

            // Requester is Admin but NOT a Shift Manager in groupBeta
            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: config.superAdmin.username,
                    groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    vacationBalance: 10,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(
                    res.statusCode,
                    403,
                    "Admin without explicit Shift Manager role in target user's group must be rejected with 403",
                );
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("AC-3c: should return 403 Forbidden when regular member attempts to modify vacationBalance", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            userHolder.findById = async () => ({
                _id: targetUserId,
                username: "beta_member",
                groups: [{ groupId: groupBetaId.toString(), role: "member" }],
            });

            // Requester is regular member of same group
            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: "another_member",
                    groups: [{ groupId: groupBetaId.toString(), role: "member" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    vacationBalance: 10,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(res.statusCode, 403, "Regular member must be rejected with 403");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("AC-4a: should return 200 OK and update vacationBalance when Shift Manager belongs to the same group as the target user", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const sharedGroupId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            let savedUser: MockUserDoc | null = null;

            const targetUserDoc: MockUserDoc = {
                _id: targetUserId,
                username: "shared_member",
                vacationBalance: 18,
                groups: [{ groupId: sharedGroupId.toString(), role: "member" }],
                save: async function (this: MockUserDoc) {
                    savedUser = this;
                    return this;
                },
            };

            userHolder.findById = async () => targetUserDoc;

            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: "group_manager",
                    groups: [{ groupId: sharedGroupId.toString(), role: "shift_manager" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    vacationBalance: 12,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                assert.ok(savedUser, "savedUser must be captured");
                const userDoc = savedUser as MockUserDoc;
                assert.equal(userDoc.vacationBalance, 12, "vacationBalance must be updated in MongoDB");
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.vacationBalance, 12);
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("AC-4b: should support vacationDays alias on managerUpdate for same-group Shift Manager", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const sharedGroupId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;

            let savedUser: MockUserDoc | null = null;

            const targetUserDoc: MockUserDoc = {
                _id: targetUserId,
                username: "shared_member",
                vacationBalance: 18,
                groups: [{ groupId: sharedGroupId.toString(), role: "member" }],
                save: async function (this: MockUserDoc) {
                    savedUser = this;
                    return this;
                },
            };

            userHolder.findById = async () => targetUserDoc;

            const req = {
                user: {
                    _id: new mongoose.Types.ObjectId(),
                    username: "group_manager",
                    groups: [{ groupId: sharedGroupId.toString(), role: "shift_manager" }],
                },
                params: { id: targetUserId.toString() },
                body: {
                    vacationDays: 14,
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(res.statusCode, 200);
                assert.ok(savedUser, "savedUser must be captured");
                const userDoc = savedUser as MockUserDoc;
                assert.equal(userDoc.vacationBalance, 14, "vacationBalance must be updated from vacationDays alias");
            } finally {
                userHolder.findById = originalFindById;
            }
        });
    });

    describe("authHelpers.isShiftManagerForTargetUser", () => {
        it("should return true only when requestingUser has shift_manager role in a group the targetUser belongs to", () => {
            const group1 = new mongoose.Types.ObjectId().toString();
            const group2 = new mongoose.Types.ObjectId().toString();

            const managerUser = {
                groups: [
                    { groupId: group1, role: "shift_manager" },
                    { groupId: group2, role: "member" },
                ],
            };

            const memberInGroup1 = {
                groups: [{ groupId: group1, role: "member" }],
            };

            const memberInGroup2 = {
                groups: [{ groupId: group2, role: "member" }],
            };

            assert.equal(
                typeof authHelpers.isShiftManagerForTargetUser,
                "function",
                "isShiftManagerForTargetUser must be defined on authHelpers",
            );
            assert.equal(authHelpers.isShiftManagerForTargetUser(managerUser, memberInGroup1), true);
            assert.equal(authHelpers.isShiftManagerForTargetUser(managerUser, memberInGroup2), false);
            assert.equal(authHelpers.isShiftManagerForTargetUser(null, memberInGroup1), false);
            assert.equal(authHelpers.isShiftManagerForTargetUser(managerUser, null), false);
        });
    });

    describe("Defense-in-Depth & Hardening Verification", () => {
        it("stripImmutableFields recursively sanitizes nested objects and arrays", () => {
            const req = {
                method: "POST",
                body: {
                    user: {
                        displayName: "Nested Bad Name",
                        email: "nested@example.com",
                    },
                    items: [
                        { displayName: "Array Item Bad Name", valid: true },
                        { sub: "nested-sub", value: 123 },
                    ],
                },
            } as unknown as Request;
            sanitizationMiddleware.stripImmutableFields(req, {} as Response, () => {});
            const body = req.body as {
                user: { displayName?: string; email: string };
                items: Array<{ displayName?: string; valid?: boolean; sub?: string; value?: number }>;
            };
            assert.equal(body.user.displayName, undefined, "Nested displayName must be stripped");
            assert.equal(body.user.email, "nested@example.com");
            assert.equal(body.items[0].displayName, undefined, "Array item displayName must be stripped");
            assert.equal(body.items[0].valid, true);
            assert.equal(body.items[1].sub, undefined, "Array item sub must be stripped");
        });

        it("usersController.reorderUsers rejects NoSQL injection objects and invalid user IDs", async () => {
            const validGroupId = new mongoose.Types.ObjectId().toString();
            const groupHolder = Group as unknown as Record<string, unknown>;
            const originalFindById = groupHolder.findById;
            groupHolder.findById = async () => ({ _id: validGroupId });

            const maliciousPayloads = [
                { groupId: validGroupId, updates: [{ userId: { $ne: null }, order: 1 }] },
                { groupId: validGroupId, updates: [{ userId: "not-a-valid-id", order: 1 }] },
                { groupId: validGroupId, updates: [{ userId: 12345, order: 1 }] },
                { groupId: validGroupId, updates: [] },
                { groupId: validGroupId, updates: new Array(201).fill({ userId: new mongoose.Types.ObjectId().toString(), order: 1 }) },
            ];

            for (const body of maliciousPayloads) {
                const req = {
                    user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                    body,
                } as unknown as Request;
                const res = createMockRes();

                await usersController.reorderUsers(req, res as unknown as Response);
                assert.equal(res.statusCode, 400, `Expected 400 for payload: ${JSON.stringify(body)}`);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.ok(json?.message);
            }

            groupHolder.findById = originalFindById;
        });

        it("usersController does not leak internal MongoDB schema details on database errors", async () => {
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            userHolder.findById = async () => {
                const err = new Error("Cast to ObjectId failed for value \"malformed\" at path \"_id\" for model \"User\"");
                err.name = "CastError";
                throw err;
            };

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: "malformed" },
                body: { email: "valid@example.com" },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.equal(res.statusCode, 400);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.message, "Invalid user update request");
                assert.ok(!String(json?.message).includes("Cast to ObjectId"), "Database internal error must not leak to client");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("usersController.updateUser blocks deactivation of the root Super Admin account", async () => {
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const superAdminDoc = {
                _id: new mongoose.Types.ObjectId(),
                username: config.superAdmin.username,
                email: config.superAdmin.email || "superadmin@example.com",
                isActive: true,
                groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
            };
            userHolder.findById = async () => superAdminDoc;

            const regularAdmin = {
                _id: new mongoose.Types.ObjectId(),
                username: "regular_admin",
                groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
            };

            const req = {
                user: regularAdmin,
                params: { id: superAdminDoc._id.toString() },
                body: { isActive: false },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.equal(res.statusCode, 403);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.code, "FORBIDDEN_SUPER_ADMIN_PROTECTED");
            } finally {
                userHolder.findById = originalFindById;
            }
        });

        it("usersController.managerUpdate blocks deactivation of the root Super Admin account", async () => {
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const superAdminDoc = {
                _id: new mongoose.Types.ObjectId(),
                username: config.superAdmin.username,
                email: config.superAdmin.email || "superadmin@example.com",
                isActive: true,
                groups: [{ groupId: "ops-group", role: "member" }],
            };
            userHolder.findById = async () => superAdminDoc;

            const shiftManager = {
                _id: new mongoose.Types.ObjectId(),
                username: "shift_mgr",
                groups: [{ groupId: "ops-group", role: "shift_manager" }],
            };

            const req = {
                user: shiftManager,
                params: { id: superAdminDoc._id.toString() },
                body: { isActive: false },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.managerUpdate(req, res as unknown as Response);
                assert.equal(res.statusCode, 403);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.code, "FORBIDDEN_SUPER_ADMIN_PROTECTED");
            } finally {
                userHolder.findById = originalFindById;
            }
        });
    });
});
