import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import config from "../config";
import User from "../models/User";
import Group from "../models/Group";
import Phone from "../models/Phone";
import Site from "../models/Site";
import ShiftReport from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";

import * as usersController from "../controllers/usersController";
import * as phonesController from "../controllers/phonesController";
import * as sitesController from "../controllers/sitesController";
import * as reportsController from "../controllers/reportsController";
import * as schedulesController from "../controllers/schedulesController";
import * as groupsController from "../controllers/groupsController";
import * as authHelpers from "../utils/authHelpers";
import { errorHandler } from "../middleware/errorMiddleware";

interface MockRes {
    statusCode: number;
    jsonData: Record<string, unknown> | unknown[] | null;
    status: (code: number) => MockRes;
    json: (data: Record<string, unknown> | unknown[]) => void;
}

function createMockRes(): MockRes {
    const res: MockRes = {
        statusCode: 200,
        jsonData: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: Record<string, unknown> | unknown[]) {
            this.jsonData = data;
        },
    };
    return res;
}

describe("Controller Cascading & Validation Rules", () => {
    describe("usersController.deleteUser", () => {
        it("should remove user from Site favoritedBy and Group members upon deletion", async () => {
            const userId = new mongoose.Types.ObjectId();
            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;
            const siteHolder = Site as unknown as Record<string, unknown>;

            const originalFindById = userHolder.findById;
            const originalUserDelete = userHolder.findByIdAndDelete;
            const originalGroupUpdate = groupHolder.updateMany;
            const originalSiteUpdate = siteHolder.updateMany;

            let groupUpdated = false;
            let siteUpdated = false;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "testuser",
                email: "test@example.com",
            });

            userHolder.findByIdAndDelete = async () => true;

            groupHolder.updateMany = async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
                if (filter.members === userId.toString() && update.$pull && update.$pull.members) {
                    groupUpdated = true;
                }
            };

            siteHolder.updateMany = async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
                if (filter.favoritedBy === userId.toString() && update.$pull && update.$pull.favoritedBy) {
                    siteUpdated = true;
                }
            };

            const req = {
                user: { username: config.superAdmin.username, email: "superadmin@example.com" },
                params: { id: userId.toString() },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.deleteUser(req, res as unknown as Response);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.message, "User deleted");
                assert.ok(groupUpdated, "Group members must be updated to remove user");
                assert.ok(siteUpdated, "Site favoritedBy must be updated to remove user");
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndDelete = originalUserDelete;
                groupHolder.updateMany = originalGroupUpdate;
                siteHolder.updateMany = originalSiteUpdate;
            }
        });

        it("should reject user deletion by non-admin user", async () => {
            const req = {
                user: { username: "regular_user", groups: [{ groupId: "group1", role: "member" }] },
                params: { id: new mongoose.Types.ObjectId().toString() },
            } as unknown as Request;

            const res = createMockRes();

            await usersController.deleteUser(req, res as unknown as Response);
            const json = res.jsonData as Record<string, unknown> | null;
            assert.equal(res.statusCode, 403);
            assert.equal(json?.code, "FORBIDDEN_ADMIN_REQUIRED");
        });

        it("should reject self-deletion by an administrator", async () => {
            const adminUserId = new mongoose.Types.ObjectId();
            const req = {
                user: {
                    _id: adminUserId,
                    username: "regular_admin",
                    groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
                },
                params: { id: adminUserId.toString() },
            } as unknown as Request;

            const res = createMockRes();

            await usersController.deleteUser(req, res as unknown as Response);
            const json = res.jsonData as Record<string, unknown> | null;
            assert.equal(res.statusCode, 403);
            assert.equal(json?.code, "FORBIDDEN_SELF_DELETION");
            assert.match(String(json?.message), /cannot delete their own accounts/i);
        });
    });

    describe("phonesController.deletePhone", () => {
        it("should clean up deleted phone from User favoritePhones upon deletion", async () => {
            const phoneId = new mongoose.Types.ObjectId();
            const phoneHolder = Phone as unknown as Record<string, unknown>;
            const userHolder = User as unknown as Record<string, unknown>;

            const originalPhoneDelete = phoneHolder.findByIdAndDelete;
            const originalUserUpdate = userHolder.updateMany;

            let userFavoritesUpdated = false;

            phoneHolder.findByIdAndDelete = async (id: string | mongoose.Types.ObjectId) => ({ _id: id, name: "Desk" });

            userHolder.updateMany = async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
                if (filter.favoritePhones === phoneId.toString() && update.$pull && update.$pull.favoritePhones) {
                    userFavoritesUpdated = true;
                }
            };

            const req = { params: { id: phoneId.toString() } } as unknown as Request;
            const res = createMockRes();

            try {
                await phonesController.deletePhone(req, res as unknown as Response);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(json?.message, "Phone deleted");
                assert.ok(userFavoritesUpdated, "User favoritePhones must be cleaned up");
            } finally {
                phoneHolder.findByIdAndDelete = originalPhoneDelete;
                userHolder.updateMany = originalUserUpdate;
            }
        });
    });

    describe("Security & NoSQL Injection Protection", () => {
        it("usersController.login should reject NoSQL operator objects and empty strings", async () => {
            const invalidPayloads: unknown[] = [
                { username: { $ne: null } },
                { username: { $gt: "" } },
                { username: "" },
                { username: "   " },
                { username: 123 },
                {},
            ];

            for (const body of invalidPayloads) {
                const req = { body } as unknown as Request;
                const res = createMockRes();

                await usersController.login(req, res as unknown as Response);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(res.statusCode, 400, `Expected 400 for payload ${JSON.stringify(body)}`);
                assert.ok(json?.message, "Error message must be present");
            }
        });

        it("authHelpers.resolveGroup should reject unverified plain object passthrough", async () => {
            const fakeGroupId = new mongoose.Types.ObjectId();
            const fakeObject = { _id: fakeGroupId, name: "InjectedGroup" };

            const groupHolder = Group as unknown as Record<string, unknown>;
            const originalFindById = groupHolder.findById;
            const originalFindOne = groupHolder.findOne;

            groupHolder.findById = async () => null;
            groupHolder.findOne = async () => null;

            try {
                const result = await authHelpers.resolveGroup(fakeObject as unknown as Parameters<typeof authHelpers.resolveGroup>[0]);
                assert.equal(result, null, "Unverified plain object literal must not be returned blindly");
            } finally {
                groupHolder.findById = originalFindById;
                groupHolder.findOne = originalFindOne;
            }
        });
    });

    describe("Mass Assignment & Update Whitelisting", () => {
        it("usersController.updateUser should whitelist allowed fields and pass runValidators", async () => {
            const userHolder = User as unknown as Record<string, unknown>;
            const originalFindById = userHolder.findById;
            const originalFindByIdAndUpdate = userHolder.findByIdAndUpdate;

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;
            let capturedOptions: Record<string, unknown> | null = null;

            userHolder.findById = async (id: string | mongoose.Types.ObjectId) => ({
                _id: id,
                username: "johndoe",
                email: "johndoe@example.com",
                groups: [],
            });

            userHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>,
                options: Record<string, unknown>
            ) => {
                capturedUpdate = update;
                capturedOptions = options;
                return {
                    _id: id,
                    username: "johndoe",
                    email: "updated@example.com",
                    groups: [],
                };
            };

            const req = {
                user: { username: "ADMINISTRATORS", groups: [{ groupId: "ADMINISTRATORS" }] },
                params: { id: new mongoose.Types.ObjectId().toString() },
                body: {
                    email: "updated@example.com",
                    displayName: "John Doe",
                    injectedEvilField: "malicious",
                    $set: { hacked: true },
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await usersController.updateUser(req, res as unknown as Response);
                assert.ok(capturedOptions, "options must be captured");
                const options = capturedOptions as Record<string, unknown>;
                assert.ok(options.runValidators, "runValidators must be enabled");

                assert.ok(capturedUpdate, "update must be captured");
                const update = capturedUpdate as Record<string, Record<string, unknown>>;
                assert.equal(update.$set?.email, "updated@example.com");
                assert.equal(update.$set?.displayName, undefined, "Immutable displayName must not be updated");
                assert.equal(update.$set?.injectedEvilField, undefined, "Unwhitelisted field must not be updated");
                assert.equal(update.$set?.$set, undefined);
            } finally {
                userHolder.findById = originalFindById;
                userHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("phonesController.updatePhone should whitelist allowed fields and enable runValidators", async () => {
            const phoneHolder = Phone as unknown as Record<string, unknown>;
            const originalFindByIdAndUpdate = phoneHolder.findByIdAndUpdate;
            const originalFindOne = phoneHolder.findOne;
            const phoneId = new mongoose.Types.ObjectId().toString();

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;
            let capturedOptions: Record<string, unknown> | null = null;

            phoneHolder.findOne = async () => null; // No duplicate conflicts
            phoneHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>,
                options: Record<string, unknown>
            ) => {
                capturedUpdate = update;
                capturedOptions = options;
                return { _id: id, name: "Updated Desk" };
            };

            const req = {
                params: { id: phoneId },
                body: {
                    name: "Updated Desk",
                    numbers: ["12345"],
                    type: "Red",
                    description: "Front Desk",
                    unauthorizedProperty: "injected",
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await phonesController.updatePhone(req, res as unknown as Response);
                assert.ok(capturedOptions, "options must be captured");
                const options = capturedOptions as Record<string, unknown>;
                assert.ok(options.runValidators, "runValidators must be enabled on updatePhone");

                assert.ok(capturedUpdate, "update must be captured");
                const update = capturedUpdate as Record<string, Record<string, unknown>>;
                assert.equal(update.$set?.name, "Updated Desk");
                assert.equal(update.$set?.unauthorizedProperty, undefined);
            } finally {
                phoneHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
                phoneHolder.findOne = originalFindOne;
            }
        });

        it("sitesController.updateSite should whitelist allowed fields and enable runValidators", async () => {
            const siteHolder = Site as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const originalFindById = siteHolder.findById;
            const originalFindByIdAndUpdate = siteHolder.findByIdAndUpdate;
            const originalGroupFindById = groupHolder.findById;
            const originalSiteFindOne = siteHolder.findOne;

            const siteId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();

            groupHolder.findById = async () => ({ _id: groupId });
            siteHolder.findOne = async () => null;
            siteHolder.findById = async () => ({
                _id: siteId,
                groupId: groupId,
            });

            let capturedUpdate: Record<string, Record<string, unknown>> | null = null;
            let capturedOptions: Record<string, unknown> | null = null;

            siteHolder.findByIdAndUpdate = async (
                id: string | mongoose.Types.ObjectId,
                update: Record<string, Record<string, unknown>>,
                options: Record<string, unknown>
            ) => {
                capturedUpdate = update;
                capturedOptions = options;
                return { _id: id, title: "New Title" };
            };

            const req = {
                user: { _id: "user1", groups: [{ groupId: groupId }] },
                params: { id: siteId },
                body: {
                    title: "New Title",
                    url: "https://example.com",
                    injectedField: "bad",
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await sitesController.updateSite(req, res as unknown as Response);
                assert.ok(capturedOptions, "options must be captured");
                const options = capturedOptions as Record<string, unknown>;
                assert.ok(options.runValidators, "runValidators must be enabled on updateSite");

                assert.ok(capturedUpdate, "update must be captured");
                const update = capturedUpdate as Record<string, Record<string, unknown>>;
                assert.equal(update.$set?.title, "New Title");
                assert.equal(update.$set?.injectedField, undefined);
            } finally {
                siteHolder.findById = originalFindById;
                siteHolder.findByIdAndUpdate = originalFindByIdAndUpdate;
                groupHolder.findById = originalGroupFindById;
                siteHolder.findOne = originalSiteFindOne;
            }
        });
    });

    describe("Temporal Query & Shift Report Invariants", () => {
        it("reportsController.getReports should filter using Date objects on date field", async () => {
            const reportHolder = ShiftReport as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const originalFind = reportHolder.find;
            const originalGroupFindById = groupHolder.findById;
            const groupId = new mongoose.Types.ObjectId();

            groupHolder.findById = async () => ({ _id: groupId });

            let capturedQuery: { date?: { $gte?: unknown; $lte?: unknown } } | null = null;
            reportHolder.find = (query: { date?: { $gte?: unknown; $lte?: unknown } }) => {
                capturedQuery = query;
                return {
                    sort: () => Promise.resolve([]),
                };
            };

            const req = {
                user: { groups: [{ groupId: groupId.toString() }] },
                query: {
                    groupId: groupId.toString(),
                    year: "2026",
                    month: "8",
                    day: "26",
                },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await reportsController.getReports(req, res as unknown as Response);
                assert.ok(capturedQuery, "Query must be captured");
                const query = capturedQuery as { date: { $gte?: unknown; $lte?: unknown } };
                assert.ok(query.date, "Temporal query must query on the 'date' field");
                assert.ok(query.date.$gte instanceof Date, "$gte must be a Date instance");
                assert.ok(query.date.$lte instanceof Date, "$lte must be a Date instance");
            } finally {
                reportHolder.find = originalFind;
                groupHolder.findById = originalGroupFindById;
            }
        });

        it("reportsController.updateReport should block modifications on locked reports for non-admins", async () => {
            const reportHolder = ShiftReport as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const originalFindById = reportHolder.findById;
            const originalGroupFindById = groupHolder.findById;
            const reportId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();

            groupHolder.findById = async () => ({ _id: groupId });
            reportHolder.findById = async () => ({
                _id: reportId,
                groupId: groupId,
                isLocked: true,
            });

            const req = {
                user: { username: "regular_user", groups: [{ groupId: groupId, role: "member" }] },
                params: { id: reportId },
                body: { currentTasks: "New Tasks" },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await reportsController.updateReport(req, res as unknown as Response);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(res.statusCode, 400, "Must return 400 for locked report modification");
                assert.equal(json?.code, "REPORT_LOCKED");
            } finally {
                reportHolder.findById = originalFindById;
                groupHolder.findById = originalGroupFindById;
            }
        });
    });

    describe("Concurrency & Vacation Deduction Invariants", () => {
        it("schedulesController.publishSchedule should guard vacation deduction with vacationBalance > 0", async () => {
            const scheduleHolder = ShiftSchedule as unknown as Record<string, unknown>;
            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const originalScheduleFindById = scheduleHolder.findById;
            const originalUserFindOneAndUpdate = userHolder.findOneAndUpdate;
            const originalGroupFindById = groupHolder.findById;

            const scheduleId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();
            const userId = new mongoose.Types.ObjectId().toString();
            const vacationShiftTypeId = new mongoose.Types.ObjectId().toString();

            groupHolder.findById = async () => ({
                _id: groupId,
                settings: {
                    shiftTypes: [{ _id: vacationShiftTypeId, isVacation: true }],
                },
            });

            scheduleHolder.findById = async () => ({
                _id: scheduleId,
                groupId: groupId,
                shifts: [
                    {
                        userId: userId,
                        shiftTypeId: vacationShiftTypeId,
                        vacationDeducted: false,
                    },
                ],
                markModified: () => {},
                save: async () => true,
            });

            let capturedUserFilter: { vacationBalance?: { $gt?: number } } | null = null;
            userHolder.findOneAndUpdate = async (filter: { vacationBalance?: { $gt?: number } }) => {
                capturedUserFilter = filter;
                return { _id: userId, vacationBalance: 5 };
            };

            const req = {
                user: { username: "manager", groups: [{ groupId: groupId, role: "shift_manager" }] },
                body: { scheduleId },
            } as unknown as Request;

            const res = createMockRes();

            try {
                await schedulesController.publishSchedule(req, res as unknown as Response);
                assert.ok(capturedUserFilter, "User.findOneAndUpdate must be called");
                const filter = capturedUserFilter as { vacationBalance?: { $gt?: number } };
                assert.deepEqual(filter.vacationBalance, { $gt: 0 }, "Must enforce vacationBalance > 0 precondition");
            } finally {
                scheduleHolder.findById = originalScheduleFindById;
                userHolder.findOneAndUpdate = originalUserFindOneAndUpdate;
                groupHolder.findById = originalGroupFindById;
            }
        });
    });

    describe("Centralized Error Middleware E11000 Duplicate Key Handling", () => {
        it("errorHandler should map E11000 MongoServerError to 409 DUPLICATE_KEY", () => {
            const mongoError = new Error("E11000 duplicate key error collection: users index: username_1 dup key: { username: 'john' }") as Error & {
                code?: number;
                keyPattern?: Record<string, number>;
            };
            mongoError.code = 11000;
            mongoError.keyPattern = { username: 1 };

            const req = { method: "POST", originalUrl: "/api/users" } as unknown as Request;
            const res = createMockRes();

            errorHandler(mongoError, req, res as unknown as Response, () => {});
            const json = res.jsonData as Record<string, unknown> | null;
            assert.equal(res.statusCode, 409, "Duplicate key error must map to HTTP 409");
            assert.equal(json?.code, "DUPLICATE_KEY");
            assert.ok(String(json?.message).includes("username"), "Message should mention the conflicting field");
        });
    });

    describe("Admin Parity & Full Directory / Group Access", () => {
        describe("authHelpers.isAdmin", () => {
            it("should identify super admin by ID, username, or email", () => {
                assert.equal(authHelpers.isAdmin({ username: config.superAdmin.id } as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
                assert.equal(authHelpers.isAdmin({ username: config.superAdmin.username } as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
                if (config.superAdmin.email) {
                    assert.equal(authHelpers.isAdmin({ email: config.superAdmin.email } as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
                }
            });

            it("should identify regular admin when user belongs to SUPER_ADMIN_GROUP_NAME with populated group document", () => {
                const adminGroupDoc = {
                    _id: new mongoose.Types.ObjectId(),
                    name: config.superAdmin.groupName,
                };
                const regularAdminUser = {
                    username: "reg_admin_1",
                    groups: [{ groupId: adminGroupDoc, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularAdminUser as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
            });

            it("should identify regular admin when user has literal admin group string name", () => {
                const regularAdminUser = {
                    username: "reg_admin_2",
                    groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularAdminUser as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
            });

            it("should identify regular admin when user has g.name or g.groupName set to SUPER_ADMIN_GROUP_NAME", () => {
                const regularAdminUser = {
                    username: "reg_admin_3",
                    groups: [{ groupId: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularAdminUser as unknown as Parameters<typeof authHelpers.isAdmin>[0]), true);
            });

            it("should return false for regular users belonging only to operational groups", () => {
                const regularUser = {
                    username: "regular_user",
                    groups: [{ groupId: { _id: new mongoose.Types.ObjectId(), name: "NOC" }, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularUser as unknown as Parameters<typeof authHelpers.isAdmin>[0]), false);
                assert.equal(authHelpers.isAdmin(null as unknown as Parameters<typeof authHelpers.isAdmin>[0]), false);
                assert.equal(authHelpers.isAdmin({} as unknown as Parameters<typeof authHelpers.isAdmin>[0]), false);
            });
        });

        describe("usersController.getUsers for Regular Admin", () => {
            it("should allow regular admin to retrieve full directory (active and inactive) across all groups", async () => {
                const allUsersInDb = [
                    { _id: new mongoose.Types.ObjectId(), username: "admin1", isActive: true, groups: [] },
                    { _id: new mongoose.Types.ObjectId(), username: "user_active", isActive: true, groups: [] },
                    { _id: new mongoose.Types.ObjectId(), username: "user_inactive", isActive: false, groups: [] },
                ];
                const userHolder = User as unknown as Record<string, unknown>;
                const originalFind = userHolder.find;
                userHolder.find = async () => allUsersInDb;

                const regularAdminUser = {
                    _id: new mongoose.Types.ObjectId(),
                    username: "regular_admin",
                    groups: [{ groupId: { _id: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName }, role: "member" }],
                };

                const req = {
                    user: regularAdminUser,
                    query: {},
                } as unknown as Request;

                const res = createMockRes();

                try {
                    await usersController.getUsers(req, res as unknown as Response);
                    assert.equal(res.statusCode, 200);
                    const list = res.jsonData as unknown[];
                    assert.equal(list.length, 3);
                    assert.deepEqual(list, allUsersInDb);
                } finally {
                    userHolder.find = originalFind;
                }
            });

            it("should reject full directory query by non-admin user with 403", async () => {
                const nonAdminUser = {
                    _id: new mongoose.Types.ObjectId(),
                    username: "regular_member",
                    groups: [{ groupId: { _id: new mongoose.Types.ObjectId(), name: "NOC" }, role: "member" }],
                };

                const req = {
                    user: nonAdminUser,
                    query: {},
                } as unknown as Request;

                const res = createMockRes();

                await usersController.getUsers(req, res as unknown as Response);
                const json = res.jsonData as Record<string, unknown> | null;
                assert.equal(res.statusCode, 403);
                assert.equal(json?.code, "FORBIDDEN_ADMIN_REQUIRED");
            });
        });

        describe("groupsController.getGroups for Regular Admin", () => {
            it("should return all groups with user counts to a regular admin identical to super admin", async () => {
                const groupA = { _id: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName };
                const groupB = { _id: new mongoose.Types.ObjectId(), name: "NOC" };
                const groupC = { _id: new mongoose.Types.ObjectId(), name: "Support" };

                const groupHolder = Group as unknown as Record<string, unknown>;
                const userHolder = User as unknown as Record<string, unknown>;

                const originalGroupFind = groupHolder.find;
                const originalUserCount = userHolder.countDocuments;

                groupHolder.find = () => ({
                    lean: async () => [groupA, groupB, groupC],
                });

                userHolder.countDocuments = async (filter: Record<string, unknown>) => {
                    if (filter["groups.groupId"] === groupA._id) return 1;
                    if (filter["groups.groupId"] === groupB._id) return 5;
                    return 0;
                };

                const regularAdminUser = {
                    _id: new mongoose.Types.ObjectId(),
                    username: "regular_admin",
                    groups: [{ groupId: { _id: groupA._id, name: config.superAdmin.groupName }, role: "member" }],
                };

                const req = {
                    user: regularAdminUser,
                } as unknown as Request;

                const res = createMockRes();

                try {
                    await groupsController.getGroups(req, res as unknown as Response);
                    assert.equal(res.statusCode, 200);
                    const list = res.jsonData as Array<{ userCount?: number }>;
                    assert.equal(list.length, 3);
                    assert.equal(list[0].userCount, 1);
                    assert.equal(list[1].userCount, 5);
                    assert.equal(list[2].userCount, 0);
                } finally {
                    groupHolder.find = originalGroupFind;
                    userHolder.countDocuments = originalUserCount;
                }
            });
        });
    });
});
