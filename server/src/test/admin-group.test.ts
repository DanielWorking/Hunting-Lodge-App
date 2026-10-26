/**
 * @module AdminGroupTests
 *
 * The server creates the administrators group at startup (and the seed before seeding), so the
 * Super Admin can get in at first login in every environment without any manual step. The group's
 * id is remembered from then on: every administrator check compares ids, never names.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import config from "../config";
import Group from "../models/Group";
import { ensureAdminGroup, getAdminGroupId, isAdminGroup } from "../services/adminGroup";

const groupHolder = Group as unknown as Record<string, unknown>;
const originalFindOneAndUpdate = groupHolder.findOneAndUpdate;
const originalFindOne = groupHolder.findOne;

afterEach(() => {
    groupHolder.findOneAndUpdate = originalFindOneAndUpdate;
    groupHolder.findOne = originalFindOne;
});

describe("ensureAdminGroup", () => {
    it("knows no administrators group before the bootstrap ran, so no group grants admin rights", () => {
        assert.equal(getAdminGroupId(), undefined);
        assert.equal(isAdminGroup(new mongoose.Types.ObjectId()), false);
    });

    it("creates the administrators group when it is missing, with no members and the default tag", async () => {
        const createdId = new mongoose.Types.ObjectId();
        const calls: unknown[][] = [];
        groupHolder.findOneAndUpdate = async (...args: unknown[]) => {
            calls.push(args);
            return { value: { _id: createdId }, lastErrorObject: { updatedExisting: false } };
        };

        assert.equal(await ensureAdminGroup(), true);
        assert.deepEqual(calls, [[
            { name: config.superAdmin.groupName },
            { $setOnInsert: { members: [], settings: { shiftTypes: [], timeSlots: [] }, siteTags: ["General"] } },
            { upsert: true, returnDocument: "after", includeResultMetadata: true },
        ]]);
        assert.equal(getAdminGroupId(), createdId.toString());
        assert.equal(isAdminGroup(createdId), true);
        assert.equal(isAdminGroup(createdId.toString()), true);
    });

    it("leaves an existing administrators group as it is and remembers its id", async () => {
        const existingId = new mongoose.Types.ObjectId();
        groupHolder.findOneAndUpdate = async () => ({ value: { _id: existingId }, lastErrorObject: { updatedExisting: true } });

        assert.equal(await ensureAdminGroup(), false);
        assert.equal(getAdminGroupId(), existingId.toString());
    });

    it("accepts that another replica created the group at the same moment", async () => {
        const racedId = new mongoose.Types.ObjectId();
        groupHolder.findOneAndUpdate = async () => {
            throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
        };
        groupHolder.findOne = async () => ({ _id: racedId });

        assert.equal(await ensureAdminGroup(), false);
        assert.equal(getAdminGroupId(), racedId.toString());
    });

    it("surfaces any other database error", async () => {
        groupHolder.findOneAndUpdate = async () => {
            throw new Error("connection lost");
        };

        await assert.rejects(() => ensureAdminGroup(), /connection lost/);
    });
});
