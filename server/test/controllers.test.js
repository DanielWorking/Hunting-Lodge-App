const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const config = require("../config");
const User = require("../models/User");
const Group = require("../models/Group");
const Phone = require("../models/Phone");
const Site = require("../models/Site");
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");

const usersController = require("../controllers/usersController");
const phonesController = require("../controllers/phonesController");
const sitesController = require("../controllers/sitesController");
const reportsController = require("../controllers/reportsController");
const schedulesController = require("../controllers/schedulesController");
const authHelpers = require("../utils/authHelpers");
const { errorHandler } = require("../middleware/errorMiddleware");

describe("Controller Cascading & Validation Rules", () => {
    describe("usersController.deleteUser", () => {
        it("should remove user from Site favoritedBy and Group members upon deletion", async () => {
            const userId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalUserDelete = User.findByIdAndDelete;
            const originalGroupUpdate = Group.updateMany;
            const originalSiteUpdate = Site.updateMany;

            let groupUpdated = false;
            let siteUpdated = false;

            User.findById = async (id) => ({
                _id: id,
                username: "testuser",
                email: "test@example.com",
            });

            User.findByIdAndDelete = async () => true;

            Group.updateMany = async (filter, update) => {
                if (filter.members === userId.toString() && update.$pull && update.$pull.members) {
                    groupUpdated = true;
                }
            };

            Site.updateMany = async (filter, update) => {
                if (filter.favoritedBy === userId.toString() && update.$pull && update.$pull.favoritedBy) {
                    siteUpdated = true;
                }
            };

            const req = {
                user: { username: config.superAdmin.username, email: "superadmin@example.com" },
                params: { id: userId.toString() },
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
                await usersController.deleteUser(req, res);
                assert.equal(responseJson?.message, "User deleted");
                assert.ok(groupUpdated, "Group members must be updated to remove user");
                assert.ok(siteUpdated, "Site favoritedBy must be updated to remove user");
            } finally {
                User.findById = originalFindById;
                User.findByIdAndDelete = originalUserDelete;
                Group.updateMany = originalGroupUpdate;
                Site.updateMany = originalSiteUpdate;
            }
        });

        it("should reject user deletion by non-admin user", async () => {
            const req = {
                user: { username: "regular_user", groups: [{ groupId: "group1", role: "member" }] },
                params: { id: new mongoose.Types.ObjectId().toString() },
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

            await usersController.deleteUser(req, res);
            assert.equal(responseStatus, 403);
            assert.equal(responseJson?.code, "FORBIDDEN_ADMIN_REQUIRED");
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

            await usersController.deleteUser(req, res);
            assert.equal(responseStatus, 403);
            assert.equal(responseJson?.code, "FORBIDDEN_SELF_DELETION");
            assert.match(responseJson?.message, /cannot delete their own accounts/i);
        });
    });

    describe("phonesController.deletePhone", () => {
        it("should clean up deleted phone from User favoritePhones upon deletion", async () => {
            const phoneId = new mongoose.Types.ObjectId();
            const originalPhoneDelete = Phone.findByIdAndDelete;
            const originalUserUpdate = User.updateMany;

            let userFavoritesUpdated = false;

            Phone.findByIdAndDelete = async (id) => ({ _id: id, name: "Desk" });

            User.updateMany = async (filter, update) => {
                if (filter.favoritePhones === phoneId.toString() && update.$pull && update.$pull.favoritePhones) {
                    userFavoritesUpdated = true;
                }
            };

            const req = { params: { id: phoneId.toString() } };
            let responseJson = null;
            const res = {
                status: () => res,
                json: (data) => {
                    responseJson = data;
                },
            };

            try {
                await phonesController.deletePhone(req, res);
                assert.equal(responseJson?.message, "Phone deleted");
                assert.ok(userFavoritesUpdated, "User favoritePhones must be cleaned up");
            } finally {
                Phone.findByIdAndDelete = originalPhoneDelete;
                User.updateMany = originalUserUpdate;
            }
        });
    });

    describe("Security & NoSQL Injection Protection", () => {
        it("usersController.login should reject NoSQL operator objects and empty strings", async () => {
            const invalidPayloads = [
                { username: { $ne: null } },
                { username: { $gt: "" } },
                { username: "" },
                { username: "   " },
                { username: 123 },
                {},
            ];

            for (const body of invalidPayloads) {
                let statusCode = 200;
                let jsonResponse = null;
                const req = { body };
                const res = {
                    status: (code) => {
                        statusCode = code;
                        return res;
                    },
                    json: (data) => {
                        jsonResponse = data;
                    },
                };

                await usersController.login(req, res);
                assert.equal(statusCode, 400, `Expected 400 for payload ${JSON.stringify(body)}`);
                assert.ok(jsonResponse?.message, "Error message must be present");
            }
        });

        it("authHelpers.resolveGroup should reject unverified plain object passthrough", async () => {
            const fakeGroupId = new mongoose.Types.ObjectId();
            const fakeObject = { _id: fakeGroupId, name: "InjectedGroup" };

            const originalFindById = Group.findById;
            const originalFindOne = Group.findOne;

            let dbQueried = false;
            Group.findById = async () => {
                dbQueried = true;
                return null;
            };
            Group.findOne = async () => {
                dbQueried = true;
                return null;
            };

            try {
                const result = await authHelpers.resolveGroup(fakeObject);
                assert.equal(result, null, "Unverified plain object literal must not be returned blindly");
            } finally {
                Group.findById = originalFindById;
                Group.findOne = originalFindOne;
            }
        });
    });

    describe("Mass Assignment & Update Whitelisting", () => {
        it("usersController.updateUser should whitelist allowed fields and pass runValidators", async () => {
            const originalFindById = User.findById;
            const originalFindByIdAndUpdate = User.findByIdAndUpdate;

            let capturedUpdate = null;
            let capturedOptions = null;

            User.findById = async (id) => ({
                _id: id,
                username: "johndoe",
                email: "johndoe@example.com",
                groups: [],
            });

            User.findByIdAndUpdate = async (id, update, options) => {
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
            };

            let jsonResponse = null;
            const res = {
                status: () => res,
                json: (data) => {
                    jsonResponse = data;
                },
            };

            try {
                await usersController.updateUser(req, res);
                assert.ok(capturedOptions?.runValidators, "runValidators must be enabled");
                assert.equal(capturedUpdate.$set.email, "updated@example.com");
                assert.equal(capturedUpdate.$set.displayName, undefined, "Immutable displayName must not be updated");
                assert.equal(capturedUpdate.$set.injectedEvilField, undefined, "Unwhitelisted field must not be updated");
                assert.equal(capturedUpdate.$set.$set, undefined);
            } finally {
                User.findById = originalFindById;
                User.findByIdAndUpdate = originalFindByIdAndUpdate;
            }
        });

        it("phonesController.updatePhone should whitelist allowed fields and enable runValidators", async () => {
            const originalFindByIdAndUpdate = Phone.findByIdAndUpdate;
            const originalFindOne = Phone.findOne;
            const phoneId = new mongoose.Types.ObjectId().toString();

            let capturedUpdate = null;
            let capturedOptions = null;

            Phone.findOne = async () => null; // No duplicate conflicts
            Phone.findByIdAndUpdate = async (id, update, options) => {
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
            };

            const res = {
                status: () => res,
                json: () => {},
            };

            try {
                await phonesController.updatePhone(req, res);
                assert.ok(capturedOptions?.runValidators, "runValidators must be enabled on updatePhone");
                assert.equal(capturedUpdate.$set.name, "Updated Desk");
                assert.equal(capturedUpdate.$set.unauthorizedProperty, undefined);
            } finally {
                Phone.findByIdAndUpdate = originalFindByIdAndUpdate;
                Phone.findOne = originalFindOne;
            }
        });

        it("sitesController.updateSite should whitelist allowed fields and enable runValidators", async () => {
            const originalFindById = Site.findById;
            const originalFindByIdAndUpdate = Site.findByIdAndUpdate;
            const originalGroupFindById = Group.findById;
            const originalSiteFindOne = Site.findOne;

            const siteId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();

            Group.findById = async () => ({ _id: groupId });
            Site.findOne = async () => null;
            Site.findById = async () => ({
                _id: siteId,
                groupId: groupId,
            });

            let capturedUpdate = null;
            let capturedOptions = null;

            Site.findByIdAndUpdate = async (id, update, options) => {
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
            };

            const res = {
                status: () => res,
                json: () => {},
            };

            try {
                await sitesController.updateSite(req, res);
                assert.ok(capturedOptions?.runValidators, "runValidators must be enabled on updateSite");
                assert.equal(capturedUpdate.$set.title, "New Title");
                assert.equal(capturedUpdate.$set.injectedField, undefined);
            } finally {
                Site.findById = originalFindById;
                Site.findByIdAndUpdate = originalFindByIdAndUpdate;
                Group.findById = originalGroupFindById;
                Site.findOne = originalSiteFindOne;
            }
        });
    });

    describe("Temporal Query & Shift Report Invariants", () => {
        it("reportsController.getReports should filter using Date objects on date field", async () => {
            const originalFind = ShiftReport.find;
            const originalGroupFindById = Group.findById;
            const groupId = new mongoose.Types.ObjectId();

            Group.findById = async () => ({ _id: groupId });

            let capturedQuery = null;
            ShiftReport.find = (query) => {
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
            };

            const res = {
                status: () => res,
                json: () => {},
            };

            try {
                await reportsController.getReports(req, res);
                assert.ok(capturedQuery?.date, "Temporal query must query on the 'date' field");
                assert.ok(capturedQuery.date.$gte instanceof Date, "$gte must be a Date instance");
                assert.ok(capturedQuery.date.$lte instanceof Date, "$lte must be a Date instance");
            } finally {
                ShiftReport.find = originalFind;
                Group.findById = originalGroupFindById;
            }
        });

        it("reportsController.updateReport should block modifications on locked reports for non-admins", async () => {
            const originalFindById = ShiftReport.findById;
            const originalGroupFindById = Group.findById;
            const reportId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();

            Group.findById = async () => ({ _id: groupId });
            ShiftReport.findById = async () => ({
                _id: reportId,
                groupId: groupId,
                isLocked: true,
            });

            const req = {
                user: { username: "regular_user", groups: [{ groupId: groupId, role: "member" }] },
                params: { id: reportId },
                body: { currentTasks: "New Tasks" },
            };

            let statusCode = 200;
            let jsonResponse = null;
            const res = {
                status: (code) => {
                    statusCode = code;
                    return res;
                },
                json: (data) => {
                    jsonResponse = data;
                },
            };

            try {
                await reportsController.updateReport(req, res);
                assert.equal(statusCode, 400, "Must return 400 for locked report modification");
                assert.equal(jsonResponse?.code, "REPORT_LOCKED");
            } finally {
                ShiftReport.findById = originalFindById;
                Group.findById = originalGroupFindById;
            }
        });
    });

    describe("Concurrency & Vacation Deduction Invariants", () => {
        it("schedulesController.publishSchedule should guard vacation deduction with vacationBalance > 0", async () => {
            const originalScheduleFindById = ShiftSchedule.findById;
            const originalUserFindOneAndUpdate = User.findOneAndUpdate;
            const originalGroupFindById = Group.findById;

            const scheduleId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();
            const userId = new mongoose.Types.ObjectId().toString();
            const vacationShiftTypeId = new mongoose.Types.ObjectId().toString();

            Group.findById = async () => ({
                _id: groupId,
                settings: {
                    shiftTypes: [{ _id: vacationShiftTypeId, isVacation: true }],
                },
            });

            ShiftSchedule.findById = async () => ({
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

            let capturedUserFilter = null;
            User.findOneAndUpdate = async (filter, update) => {
                capturedUserFilter = filter;
                return { _id: userId, vacationBalance: 5 };
            };

            const req = {
                user: { username: "manager", groups: [{ groupId: groupId, role: "shift_manager" }] },
                body: { scheduleId },
            };

            const res = {
                status: () => res,
                json: () => {},
            };

            try {
                await schedulesController.publishSchedule(req, res);
                assert.ok(capturedUserFilter, "User.findOneAndUpdate must be called");
                assert.deepEqual(capturedUserFilter.vacationBalance, { $gt: 0 }, "Must enforce vacationBalance > 0 precondition");
            } finally {
                ShiftSchedule.findById = originalScheduleFindById;
                User.findOneAndUpdate = originalUserFindOneAndUpdate;
                Group.findById = originalGroupFindById;
            }
        });
    });

    describe("Centralized Error Middleware E11000 Duplicate Key Handling", () => {
        it("errorHandler should map E11000 MongoServerError to 409 DUPLICATE_KEY", () => {
            const mongoError = new Error("E11000 duplicate key error collection: users index: username_1 dup key: { username: 'john' }");
            mongoError.code = 11000;
            mongoError.keyPattern = { username: 1 };

            let statusCode = 200;
            let jsonResponse = null;

            const req = { method: "POST", originalUrl: "/api/users" };
            const res = {
                statusCode: 200,
                status: (code) => {
                    statusCode = code;
                    return res;
                },
                json: (data) => {
                    jsonResponse = data;
                },
            };

            errorHandler(mongoError, req, res, () => {});
            assert.equal(statusCode, 409, "Duplicate key error must map to HTTP 409");
            assert.equal(jsonResponse?.code, "DUPLICATE_KEY");
            assert.ok(jsonResponse?.message.includes("username"), "Message should mention the conflicting field");
        });
    });

    describe("Admin Parity & Full Directory / Group Access", () => {
        describe("authHelpers.isAdmin", () => {
            it("should identify super admin by ID, username, or email", () => {
                assert.equal(authHelpers.isAdmin({ username: config.superAdmin.id }), true);
                assert.equal(authHelpers.isAdmin({ username: config.superAdmin.username }), true);
                if (config.superAdmin.email) {
                    assert.equal(authHelpers.isAdmin({ email: config.superAdmin.email }), true);
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
                assert.equal(authHelpers.isAdmin(regularAdminUser), true);
            });

            it("should identify regular admin when user has literal admin group string name", () => {
                const regularAdminUser = {
                    username: "reg_admin_2",
                    groups: [{ groupId: config.superAdmin.groupName, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularAdminUser), true);
            });

            it("should identify regular admin when user has g.name or g.groupName set to SUPER_ADMIN_GROUP_NAME", () => {
                const regularAdminUser = {
                    username: "reg_admin_3",
                    groups: [{ groupId: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularAdminUser), true);
            });

            it("should return false for regular users belonging only to operational groups", () => {
                const regularUser = {
                    username: "regular_user",
                    groups: [{ groupId: { _id: new mongoose.Types.ObjectId(), name: "NOC" }, role: "member" }],
                };
                assert.equal(authHelpers.isAdmin(regularUser), false);
                assert.equal(authHelpers.isAdmin(null), false);
                assert.equal(authHelpers.isAdmin({}), false);
            });
        });

        describe("usersController.getUsers for Regular Admin", () => {
            it("should allow regular admin to retrieve full directory (active and inactive) across all groups", async () => {
                const allUsersInDb = [
                    { _id: new mongoose.Types.ObjectId(), username: "admin1", isActive: true, groups: [] },
                    { _id: new mongoose.Types.ObjectId(), username: "user_active", isActive: true, groups: [] },
                    { _id: new mongoose.Types.ObjectId(), username: "user_inactive", isActive: false, groups: [] },
                ];
                const originalFind = User.find;
                User.find = async () => allUsersInDb;

                const regularAdminUser = {
                    _id: new mongoose.Types.ObjectId(),
                    username: "regular_admin",
                    groups: [{ groupId: { _id: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName }, role: "member" }],
                };

                const req = {
                    user: regularAdminUser,
                    query: {},
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
                    await usersController.getUsers(req, res);
                    assert.equal(responseStatus, 200);
                    assert.equal(responseJson.length, 3);
                    assert.deepEqual(responseJson, allUsersInDb);
                } finally {
                    User.find = originalFind;
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

                await usersController.getUsers(req, res);
                assert.equal(responseStatus, 403);
                assert.equal(responseJson?.code, "FORBIDDEN_ADMIN_REQUIRED");
            });
        });

        describe("groupsController.getGroups for Regular Admin", () => {
            it("should return all groups with user counts to a regular admin identical to super admin", async () => {
                const groupA = { _id: new mongoose.Types.ObjectId(), name: config.superAdmin.groupName };
                const groupB = { _id: new mongoose.Types.ObjectId(), name: "NOC" };
                const groupC = { _id: new mongoose.Types.ObjectId(), name: "Support" };

                const originalGroupFind = Group.find;
                const originalUserCount = User.countDocuments;

                Group.find = () => ({
                    lean: async () => [groupA, groupB, groupC],
                });

                User.countDocuments = async (filter) => {
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
                    const groupsController = require("../controllers/groupsController");
                    await groupsController.getGroups(req, res);
                    assert.equal(responseStatus, 200);
                    assert.equal(responseJson.length, 3);
                    assert.equal(responseJson[0].userCount, 1);
                    assert.equal(responseJson[1].userCount, 5);
                    assert.equal(responseJson[2].userCount, 0);
                } finally {
                    Group.find = originalGroupFind;
                    User.countDocuments = originalUserCount;
                }
            });
        });
    });
});
