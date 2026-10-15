/**
 * @module AdminGroupTests
 *
 * The server creates the administrators group at startup (and the seed before seeding), so the
 * Super Admin can get in at first login in every environment without any manual step.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import config from "../config";
import Group from "../models/Group";
import { ensureAdminGroup } from "../services/adminGroup";

const groupHolder = Group as unknown as Record<string, unknown>;
const originalUpdateOne = groupHolder.updateOne;

afterEach(() => {
    groupHolder.updateOne = originalUpdateOne;
});

describe("ensureAdminGroup", () => {
    it("creates the administrators group when it is missing, with no members and the default tag", async () => {
        const calls: unknown[][] = [];
        groupHolder.updateOne = async (...args: unknown[]) => {
            calls.push(args);
            return { upsertedCount: 1 };
        };

        assert.equal(await ensureAdminGroup(), true);
        assert.deepEqual(calls, [[
            { name: config.superAdmin.groupName },
            { $setOnInsert: { members: [], settings: { shiftTypes: [], timeSlots: [] }, siteTags: ["General"] } },
            { upsert: true },
        ]]);
    });

    it("leaves an existing administrators group as it is", async () => {
        groupHolder.updateOne = async () => ({ upsertedCount: 0 });

        assert.equal(await ensureAdminGroup(), false);
    });

    it("accepts that another replica created the group at the same moment", async () => {
        groupHolder.updateOne = async () => {
            throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
        };

        assert.equal(await ensureAdminGroup(), false);
    });

    it("surfaces any other database error", async () => {
        groupHolder.updateOne = async () => {
            throw new Error("connection lost");
        };

        await assert.rejects(() => ensureAdminGroup(), /connection lost/);
    });
});
