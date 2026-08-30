const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const config = require("../config");
const User = require("../models/User");
const Group = require("../models/Group");
const usersController = require("../controllers/usersController");
const authHelpers = require("../utils/authHelpers");
let sanitizationMiddleware;
try {
    sanitizationMiddleware = require("../middleware/sanitizationMiddleware");
} catch (e) {
    sanitizationMiddleware = null;
}

describe("Security Authorization Gates & Input Sanitization", () => {
    describe("AC-1: SSO Field Immutability (Display Name)", () => {
        it("AC-1a: usersController.updateUser must strip or reject displayName so it is never updated in MongoDB", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalFindByIdAndUpdate = User.findByIdAndUpdate;

            let capturedUpdate = null;

            User.findById = async (id) => ({
                _id: id,
                username: "testuser",
                displayName: "Original SSO Name",
                email: "test@example.com",
                groups: [],
            });

            User.findByIdAndUpdate = async (id, update, options) => {
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                // Either displayName is stripped from $set or request is rejected with 400 Bad Request
                if (responseStatus === 200) {
                    assert.equal(
                        capturedUpdate?.$set?.displayName,
                        undefined,
                        "displayName must NOT be included in database update payload",
                    );
                } else {
                    assert.equal(responseStatus, 400);
                }
            } finally {
                User.findById = originalFindById;
                User.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("AC-1b: usersController.managerUpdate must strip or ignore displayName", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            let savedUser = null;

            const targetUserDoc = {
                _id: targetUserId,
                username: "groupmember",
                displayName: "SSO Original Name",
                vacationBalance: 10,
                groups: [{ groupId: groupId.toString(), role: "member" }],
                save: async function () {
                    savedUser = this;
                    return this;
                },
            };

            User.findById = async () => targetUserDoc;

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
            };

            let responseStatus = 200;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: () => {},
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(responseStatus, 200);
                assert.equal(savedUser?.displayName, "SSO Original Name", "displayName must remain unchanged");
                assert.equal(savedUser?.vacationBalance, 12);
            } finally {
                User.findById = originalFindById;
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
            };
            const res = {};
            let nextCalled = false;

            sanitizationMiddleware.stripImmutableFields(req, res, () => {
                nextCalled = true;
            });

            assert.ok(nextCalled, "next() must be called");
            assert.equal(req.body.displayName, undefined, "displayName must be stripped");
            assert.equal(req.body.sub, undefined, "sub must be stripped");
            assert.equal(req.body.oidcId, undefined, "oidcId must be stripped");
            assert.equal(req.body.email, "legit@example.com", "Legitimate fields must be preserved");
            assert.equal(req.body.isActive, true);
        });
    });

    describe("AC-2: Admin User-Management Boundary & Group Role Management (PUT /api/users/:id)", () => {
        it("AC-2a: should strip/ignore vacationBalance and displayName when Admin updates user on /api/users/:id", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalFindByIdAndUpdate = User.findByIdAndUpdate;

            let capturedUpdate = null;

            User.findById = async (id) => ({
                _id: id,
                username: "regularuser",
                displayName: "SSO Original Name",
                vacationBalance: 18,
                groups: [],
            });

            User.findByIdAndUpdate = async (id, update, options) => {
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                assert.equal(responseStatus, 200);
                assert.equal(capturedUpdate?.$set?.email, "updated@example.com");
                assert.equal(capturedUpdate?.$set?.displayName, undefined, "displayName must be excluded from $set");
                assert.equal(capturedUpdate?.$set?.vacationBalance, undefined, "vacationBalance must be excluded from $set");
                assert.equal(capturedUpdate?.$set?.vacationDays, undefined, "vacationDays must be excluded from $set");
            } finally {
                User.findById = originalFindById;
                User.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("AC-2b: should allow Administrator to add a user to a group and grant shift_manager role", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const targetGroupId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalFindByIdAndUpdate = User.findByIdAndUpdate;
            const originalGroupUpdateMany = Group.updateMany;

            let capturedUpdate = null;
            let groupMembersUpdated = false;

            User.findById = async (id) => ({
                _id: id,
                username: "regularuser",
                groups: [],
            });

            User.findByIdAndUpdate = async (id, update, options) => {
                capturedUpdate = update;
                return {
                    _id: id,
                    username: "regularuser",
                    groups: [{ groupId: targetGroupId, role: "shift_manager", order: 0 }],
                };
            };

            Group.updateMany = async (filter, update) => {
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                assert.equal(responseStatus, 200);
                assert.deepEqual(capturedUpdate?.$set?.groups, [
                    { groupId: targetGroupId.toString(), role: "shift_manager", order: 0 },
                ]);
                assert.ok(groupMembersUpdated, "Target group members must be updated with the user");
                assert.equal(responseJson?.groups?.[0]?.role, "shift_manager");
            } finally {
                User.findById = originalFindById;
                User.findByIdAndUpdate = originalFindByIdAndUpdate;
                Group.updateMany = originalGroupUpdateMany;
            }
        });

        it("AC-2c: should allow Administrator to update permitted profile fields on /api/users/:id", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalFindByIdAndUpdate = User.findByIdAndUpdate;

            User.findById = async (id) => ({
                _id: id,
                username: "regularuser",
                groups: [],
            });

            User.findByIdAndUpdate = async (id, update, options) => ({
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                assert.equal(responseStatus, 200);
                assert.equal(responseJson?.email, "newemail@example.com");
            } finally {
                User.findById = originalFindById;
                User.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });
    });

    describe("AC-3 & AC-4: Group-Settings Tenancy Check (PATCH /api/users/:id/manager-update)", () => {
        it("AC-3a: should return 403 Forbidden when Shift Manager attempts to update vacation for a user in a different group", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupAlphaId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            User.findById = async () => ({
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(
                    responseStatus,
                    403,
                    "Shift Manager of disjoint group must be rejected with 403 Forbidden",
                );
                assert.ok(
                    responseJson?.code === "FORBIDDEN_MANAGER_REQUIRED" || responseJson?.code === "FORBIDDEN_TENANCY_MISMATCH",
                );
            } finally {
                User.findById = originalFindById;
            }
        });

        it("AC-3b: should return 403 Forbidden when generic Administrator attempts to modify vacationBalance without group Shift Manager role", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            User.findById = async () => ({
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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(
                    responseStatus,
                    403,
                    "Admin without explicit Shift Manager role in target user's group must be rejected with 403",
                );
            } finally {
                User.findById = originalFindById;
            }
        });

        it("AC-3c: should return 403 Forbidden when regular member attempts to modify vacationBalance", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const groupBetaId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            User.findById = async () => ({
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
            };

            let responseStatus = 200;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: () => {},
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(responseStatus, 403, "Regular member must be rejected with 403");
            } finally {
                User.findById = originalFindById;
            }
        });

        it("AC-4a: should return 200 OK and update vacationBalance when Shift Manager belongs to the same group as the target user", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const sharedGroupId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            let savedUser = null;

            const targetUserDoc = {
                _id: targetUserId,
                username: "shared_member",
                vacationBalance: 18,
                groups: [{ groupId: sharedGroupId.toString(), role: "member" }],
                save: async function () {
                    savedUser = this;
                    return this;
                },
            };

            User.findById = async () => targetUserDoc;

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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(responseStatus, 200);
                assert.equal(savedUser?.vacationBalance, 12, "vacationBalance must be updated in MongoDB");
                assert.equal(responseJson?.vacationBalance, 12);
            } finally {
                User.findById = originalFindById;
            }
        });

        it("AC-4b: should support vacationDays alias on managerUpdate for same-group Shift Manager", async () => {
            const targetUserId = new mongoose.Types.ObjectId();
            const sharedGroupId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;

            let savedUser = null;

            const targetUserDoc = {
                _id: targetUserId,
                username: "shared_member",
                vacationBalance: 18,
                groups: [{ groupId: sharedGroupId.toString(), role: "member" }],
                save: async function () {
                    savedUser = this;
                    return this;
                },
            };

            User.findById = async () => targetUserDoc;

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
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.managerUpdate(req, res);
                assert.equal(responseStatus, 200);
                assert.equal(savedUser?.vacationBalance, 14, "vacationBalance must be updated from vacationDays alias");
            } finally {
                User.findById = originalFindById;
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
            };
            sanitizationMiddleware.stripImmutableFields(req, {}, () => {});
            assert.equal(req.body.user.displayName, undefined, "Nested displayName must be stripped");
            assert.equal(req.body.user.email, "nested@example.com");
            assert.equal(req.body.items[0].displayName, undefined, "Array item displayName must be stripped");
            assert.equal(req.body.items[0].valid, true);
            assert.equal(req.body.items[1].sub, undefined, "Array item sub must be stripped");
        });

        it("usersController.reorderUsers rejects NoSQL injection objects and invalid user IDs", async () => {
            const validGroupId = new mongoose.Types.ObjectId().toString();
            const originalFindById = Group.findById;
            Group.findById = async () => ({ _id: validGroupId });

            const maliciousPayloads = [
                { groupId: validGroupId, updates: [{ userId: { $ne: null }, order: 1 }] },
                { groupId: validGroupId, updates: [{ userId: "not-a-valid-id", order: 1 }] },
                { groupId: validGroupId, updates: [{ userId: 12345, order: 1 }] },
                { groupId: validGroupId, updates: [] },
                { groupId: validGroupId, updates: new Array(201).fill({ userId: new mongoose.Types.ObjectId().toString(), order: 1 }) },
            ];

            for (const body of maliciousPayloads) {
                let statusCode = 200;
                let jsonResponse = null;
                const req = {
                    user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                    body,
                };
                const res = {
                    status: (code) => {
                        statusCode = code;
                        return res;
                    },
                    json: (data) => {
                        jsonResponse = data;
                    },
                };

                await usersController.reorderUsers(req, res);
                assert.equal(statusCode, 400, `Expected 400 for payload: ${JSON.stringify(body)}`);
                assert.ok(jsonResponse?.message);
            }

            Group.findById = originalFindById;
        });

        it("usersController does not leak internal MongoDB schema details on database errors", async () => {
            const originalFindById = User.findById;
            User.findById = async () => {
                const err = new Error("Cast to ObjectId failed for value \"malformed\" at path \"_id\" for model \"User\"");
                err.name = "CastError";
                throw err;
            };

            const req = {
                user: { username: config.superAdmin.username, groups: [{ groupId: config.superAdmin.groupName }] },
                params: { id: "malformed" },
                body: { email: "valid@example.com" },
            };

            let responseStatus = 200;
            let responseJson = null;
            const res = {
                status: (code) => {
                    responseStatus = code;
                    return res;
                },
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                assert.equal(responseStatus, 400);
                assert.equal(responseJson?.message, "Invalid user update request");
                assert.ok(!responseJson?.message.includes("Cast to ObjectId"), "Database internal error must not leak to client");
            } finally {
                User.findById = originalFindById;
            }
        });
    });
});
