import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import User from "../models/User";
import Group from "../models/Group";
import Phone from "../models/Phone";
import ShiftReport from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import Site from "../models/Site";

type IndexSpecMap = Record<string, number | string>;

describe("Mongoose Schema Validations & Constraints", () => {
    describe("User Model", () => {
        it("should require username and email", async () => {
            const user = new User({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await user.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.username, "Username must be required");
            assert.ok(err.errors.email, "Email must be required");
        });

        it("should reject invalid email format", async () => {
            const user = new User({
                username: "johndoe",
                email: "not-an-email",
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await user.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.email, "Invalid email format should be rejected");
        });

        it("should enforce default role 'member' and reject invalid roles in groups", async () => {
            const validUser = new User({
                username: "johndoe",
                email: "john@example.com",
                groups: [{ groupId: new mongoose.Types.ObjectId() }],
            });
            assert.equal(validUser.groups[0].role, "member");

            const invalidUser = new User({
                username: "johndoe2",
                email: "john2@example.com",
                groups: [{ groupId: new mongoose.Types.ObjectId(), role: "super_admin_invalid" as unknown as "member" }],
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await invalidUser.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors["groups.0.role"], "Invalid group role should be rejected");
        });

        it("should enforce vacationBalance min 0", async () => {
            const user = new User({
                username: "johndoe",
                email: "john@example.com",
                vacationBalance: -5,
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await user.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.vacationBalance, "Negative vacationBalance should be rejected");
        });

        it("should default favoritePhones to empty array", () => {
            const user = new User({
                username: "johndoe",
                email: "john@example.com",
            });
            assert.deepEqual(user.favoritePhones, []);
        });

        it("should define compound & multikey indexes for groups", () => {
            const indexes = User.schema.indexes();
            const hasGroupIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap)["groups.groupId"] === 1 && Object.keys(spec).length === 1
            );
            const hasGroupOrderIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap)["groups.groupId"] === 1 && (spec as IndexSpecMap)["groups.order"] === 1
            );
            assert.ok(hasGroupIndex, "Expected index on groups.groupId");
            assert.ok(hasGroupOrderIndex, "Expected compound index on groups.groupId and groups.order");
        });
    });

    describe("Group Model", () => {
        it("should require name", async () => {
            const group = new Group({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await group.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.name, "Group name must be required");
        });

        it("should validate hex color code format for ShiftTypes", async () => {
            const invalidGroup = new Group({
                name: "Alpha Lodge",
                settings: {
                    shiftTypes: [{ name: "Night", color: "invalid-color" }],
                },
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await invalidGroup.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected for invalid color");
            assert.ok(
                err.errors["settings.shiftTypes.0.color"],
                "Invalid color hex code must be rejected"
            );

            const validGroup = new Group({
                name: "Bravo Lodge",
                settings: {
                    shiftTypes: [{ name: "Night", color: "#1976d2" }],
                },
            });
            let validErr: mongoose.Error.ValidationError | undefined;
            try {
                await validGroup.validate();
            } catch (e) {
                validErr = e as mongoose.Error.ValidationError;
            }
            assert.equal(validErr, undefined);
        });

        it("should validate 24-hour HH:mm time format for TimeSlots", async () => {
            const invalidGroup = new Group({
                name: "Charlie Lodge",
                settings: {
                    timeSlots: [
                        { name: "Morning", startTime: "8:00", endTime: "16:00" },
                    ],
                },
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await invalidGroup.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected for invalid time format '8:00'");
            assert.ok(
                err.errors["settings.timeSlots.0.startTime"],
                "Time format must strictly match HH:mm"
            );

            const validGroup = new Group({
                name: "Delta Lodge",
                settings: {
                    timeSlots: [
                        { name: "Morning", startTime: "08:00", endTime: "16:00" },
                    ],
                },
            });
            let validErr: mongoose.Error.ValidationError | undefined;
            try {
                await validGroup.validate();
            } catch (e) {
                validErr = e as mongoose.Error.ValidationError;
            }
            assert.equal(validErr, undefined);
        });

        it("should default siteTags to ['General']", () => {
            const group = new Group({ name: "Echo Lodge" });
            assert.deepEqual(group.siteTags, ["General"]);
        });
    });

    describe("Phone Model", () => {
        it("should require name and numbers", async () => {
            const phone = new Phone({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await phone.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.name, "Name must be required");
            assert.ok(err.errors.numbers, "Numbers array must be required");
        });

        it("should reject empty numbers array or array with empty strings", async () => {
            const emptyPhone = new Phone({
                name: "Emergency Desk",
                numbers: [],
                type: "Red",
            });
            let err1: mongoose.Error.ValidationError | undefined;
            try {
                await emptyPhone.validate();
            } catch (e) {
                err1 = e as mongoose.Error.ValidationError;
            }
            assert.ok(err1, "Empty numbers array should fail validation");

            const blankPhone = new Phone({
                name: "Emergency Desk",
                numbers: ["   "],
                type: "Red",
            });
            let err2: mongoose.Error.ValidationError | undefined;
            try {
                await blankPhone.validate();
            } catch (e) {
                err2 = e as mongoose.Error.ValidationError;
            }
            assert.ok(err2, "Numbers array with whitespace-only strings should fail validation");
        });

        it("should enforce valid phone type enum", async () => {
            const invalidPhone = new Phone({
                name: "Desk",
                numbers: ["1234"],
                type: "Secret" as unknown as "Red",
            });
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await invalidPhone.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.type, "Invalid phone type enum should be rejected");
        });

        it("should define multikey index on numbers and sort index on name", () => {
            const indexes = Phone.schema.indexes();
            const hasNumbersIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).numbers === 1
            );
            const hasNameIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).name === 1
            );
            assert.ok(hasNumbersIndex, "Expected index on numbers");
            assert.ok(hasNameIndex, "Expected index on name");
        });
    });

    describe("ShiftReport Model", () => {
        it("should require groupId, title, date, startTime, endTime", async () => {
            const report = new ShiftReport({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await report.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.groupId, "groupId is required");
            assert.ok(err.errors.title, "title is required");
            assert.ok(err.errors.date, "date is required");
            assert.ok(err.errors.startTime, "startTime is required");
            assert.ok(err.errors.endTime, "endTime is required");
        });

        it("should define compound index on { groupId: 1, startTime: -1 } and { groupId: 1, title: 1 }", () => {
            const indexes = ShiftReport.schema.indexes();
            const hasStartTimeIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).groupId === 1 && (spec as IndexSpecMap).startTime === -1
            );
            const hasTitleIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).groupId === 1 && (spec as IndexSpecMap).title === 1
            );
            assert.ok(hasStartTimeIndex, "Expected compound index on groupId and startTime desc");
            assert.ok(hasTitleIndex, "Expected compound index on groupId and title");
        });
    });

    describe("ShiftSchedule Model", () => {
        it("should require groupId, startDate, endDate", async () => {
            const schedule = new ShiftSchedule({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await schedule.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.groupId, "groupId is required");
            assert.ok(err.errors.startDate, "startDate is required");
            assert.ok(err.errors.endDate, "endDate is required");
        });

        it("should define unique compound index on { groupId: 1, startDate: 1 } and query index on published schedule ranges", () => {
            const indexes = ShiftSchedule.schema.indexes();
            const hasUniqueStartDate = indexes.some(
                ([spec, options]) => (spec as IndexSpecMap).groupId === 1 && (spec as IndexSpecMap).startDate === 1 && options?.unique === true
            );
            const hasPublishedRangeIndex = indexes.some(
                ([spec]) =>
                    (spec as IndexSpecMap).groupId === 1 &&
                    (spec as IndexSpecMap).isPublished === 1 &&
                    (spec as IndexSpecMap).startDate === 1 &&
                    (spec as IndexSpecMap).endDate === 1
            );
            assert.ok(hasUniqueStartDate, "Expected unique index on groupId and startDate");
            assert.ok(hasPublishedRangeIndex, "Expected compound index for published schedule queries");
        });
    });

    describe("Site Model", () => {
        it("should require title, url, and groupId", async () => {
            const site = new Site({});
            let err: mongoose.Error.ValidationError | undefined;
            try {
                await site.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }
            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.title, "title is required");
            assert.ok(err.errors.url, "url is required");
            assert.ok(err.errors.groupId, "groupId is required");
        });

        it("should default tag to 'General' and favoritedBy to empty array", () => {
            const site = new Site({
                title: "Portal",
                url: "https://portal.local",
                groupId: new mongoose.Types.ObjectId(),
            });
            assert.equal(site.tag, "General");
            assert.deepEqual(site.favoritedBy, []);
        });

        it("should define compound indexes on { groupId: 1, tag: 1 } and { groupId: 1, url: 1 }", () => {
            const indexes = Site.schema.indexes();
            const hasTagIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).groupId === 1 && (spec as IndexSpecMap).tag === 1
            );
            const hasUrlIndex = indexes.some(
                ([spec]) => (spec as IndexSpecMap).groupId === 1 && (spec as IndexSpecMap).url === 1
            );
            assert.ok(hasTagIndex, "Expected compound index on groupId and tag");
            assert.ok(hasUrlIndex, "Expected compound index on groupId and url");
        });
    });
});
