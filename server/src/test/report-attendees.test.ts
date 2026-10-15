/**
 * @module ReportAttendeesTests
 *
 * Automatic report attendees come from one routine (services/reportAttendees) shared by the cron,
 * manual report creation and the re-sync after a publish: Jerusalem day and time slot, the slot's
 * linked shift types, and active group members only.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import Group from "../models/Group";
import User from "../models/User";
import ShiftReport from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import * as reportsController from "../controllers/reportsController";
import { processGroupSlot } from "../services/cronJobs";
import { matchTimeSlot, mergeAttendees, scheduledUserIds } from "../services/reportAttendees";
import { clearGroupCache } from "../utils/authHelpers";

const restores: Array<() => void> = [];
function patch(target: unknown, key: string, value: unknown): void {
    const holder = target as Record<string, unknown>;
    const original = holder[key];
    holder[key] = value;
    restores.push(() => {
        holder[key] = original;
    });
}
afterEach(() => {
    while (restores.length > 0) restores.pop()?.();
    clearGroupCache();
});

const newId = (): string => new mongoose.Types.ObjectId().toString();
const MORNING = newId();
const NIGHT = newId();
const slots = [
    { name: "Morning", startTime: "08:00", endTime: "16:00", linkedShiftTypes: [MORNING] },
    { name: "Night", startTime: "23:00", endTime: "07:00", linkedShiftTypes: [NIGHT] },
];
// 14 Oct 2026 is in Israel daylight time (UTC+3): 05:00Z is 08:00 in Jerusalem
const morningStart = new Date("2026-10-14T05:00:00.000Z");
// The schedule page stores a day as Jerusalem midnight: 14 Oct starts at 13 Oct 21:00Z
const oct14 = new Date("2026-10-13T21:00:00.000Z");
const oct15 = new Date("2026-10-14T21:00:00.000Z");

describe("matchTimeSlot / scheduledUserIds: Jerusalem time, linked shift types", () => {
    it("matches the slot on Jerusalem wall-clock time, whatever the server's time zone", () => {
        assert.equal(matchTimeSlot(slots, morningStart)?.name, "Morning");
        assert.equal(matchTimeSlot(slots, new Date("2026-10-14T05:04:00.000Z"))?.name, "Morning", "within 5 minutes");
        assert.equal(matchTimeSlot(slots, new Date("2026-10-14T08:00:00.000Z")), undefined, "08:00 UTC is 11:00 in Jerusalem");
    });

    it("lists each user with a shift of a linked type on the report's Jerusalem day, once", () => {
        const alice = newId();
        const bob = newId();
        const carol = newId();
        const ids = scheduledUserIds([
            { userId: alice, shiftTypeId: MORNING, date: oct14 },
            { userId: alice, shiftTypeId: MORNING, date: oct14 },
            { userId: bob, shiftTypeId: NIGHT, date: oct14 },
            { userId: carol, shiftTypeId: MORNING, date: oct15 },
        ], slots[0], morningStart);

        assert.deepEqual(ids, [alice]);
    });

    it("counts every shift type when no slot matched or the slot links none", () => {
        const alice = newId();
        const bob = newId();
        const shifts = [
            { userId: alice, shiftTypeId: MORNING, date: oct14 },
            { userId: bob, shiftTypeId: NIGHT, date: oct14 },
        ];
        assert.deepEqual(scheduledUserIds(shifts, undefined, morningStart), [alice, bob]);
        assert.deepEqual(scheduledUserIds(shifts, { startTime: "08:00", linkedShiftTypes: [] }, morningStart), [alice, bob]);
    });
});

describe("mergeAttendees", () => {
    it("puts the automatic attendees first and keeps manual entries that are not already listed", () => {
        const auto = newId();
        const manual = newId();
        const merged = mergeAttendees(
            [
                { userId: new mongoose.Types.ObjectId(newId()), name: "stale-auto", isManual: false },
                { userId: new mongoose.Types.ObjectId(manual), name: "manual", isManual: true },
                { userId: new mongoose.Types.ObjectId(auto), name: "dup", isManual: true },
                { name: "Guest without an account", isManual: true },
            ],
            [{ userId: new mongoose.Types.ObjectId(auto), name: "auto", isManual: false }],
        );

        assert.deepEqual(merged.map((a) => a.name), ["auto", "manual", "Guest without an account"]);
    });
});

/** A user store whose `find` honours the `isActive` and `groups.groupId` filters. */
function mockUsers(users: Array<{ _id: string; username: string; isActive?: boolean; groupId: string }>) {
    patch(User, "find", (filter: { _id: { $in: unknown[] }; isActive?: unknown; "groups.groupId"?: unknown }) => {
        const ids = filter._id.$in.map(String);
        const found = users
            .filter((u) => ids.includes(u._id))
            .filter((u) => filter.isActive === undefined || u.isActive !== false)
            .filter((u) => filter["groups.groupId"] === undefined || String(filter["groups.groupId"]) === u.groupId)
            .map((u) => ({ _id: new mongoose.Types.ObjectId(u._id), username: u.username }));
        return { lean: async () => found, then: (resolve: (v: unknown) => unknown) => Promise.resolve(found).then(resolve) };
    });
}

describe("automatic attendees list active group members only", () => {
    const groupId = newId();
    const active = { _id: newId(), username: "active", groupId };
    const deactivated = { _id: newId(), username: "deactivated", groupId, isActive: false };
    const otherShiftType = { _id: newId(), username: "night-worker", groupId };
    const shifts = [
        { userId: active._id, shiftTypeId: MORNING, date: oct14 },
        { userId: deactivated._id, shiftTypeId: MORNING, date: oct14 },
        { userId: otherShiftType._id, shiftTypeId: NIGHT, date: oct14 },
    ];

    it("manual report creation matches the slot on Jerusalem time and skips a deactivated member", async () => {
        patch(Group, "findById", async () => ({ _id: groupId, name: `att-${groupId}`, settings: { timeSlots: slots } }));
        patch(ShiftReport, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
        patch(ShiftSchedule, "findOne", () => ({ select: () => ({ lean: async () => ({ shifts }) }) }));
        mockUsers([active, deactivated, otherShiftType]);
        let saved: Record<string, unknown> | null = null;
        patch(ShiftReport.prototype, "save", async function (this: Record<string, unknown>) {
            saved = this;
            return this;
        });
        const res = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json() { return this; } };

        await reportsController.createReport(
            {
                body: { groupId, title: "Morning - 14/10/2026", startTime: morningStart.toISOString(), endTime: "2026-10-14T13:00:00.000Z" },
                user: { _id: newId(), groups: [{ groupId, role: "member" }] },
            } as unknown as Request,
            res as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );

        assert.equal(res.statusCode, 201);
        const attendees = ((saved as unknown as { attendees: Array<{ name: string; isManual: boolean }> }).attendees);
        assert.deepEqual(attendees.map((a) => [a.name, a.isManual]), [["active", false]]);
    });

    it("the cron lists the same attendees for the same slot", async () => {
        patch(ShiftReport, "findOne", () => ({ lean: async () => null, sort: () => ({ lean: async () => null }) }));
        patch(ShiftSchedule, "findOne", () => ({ lean: async () => ({ shifts }) }));
        mockUsers([active, deactivated, otherShiftType]);
        let saved: Record<string, unknown> | null = null;
        patch(ShiftReport.prototype, "save", async function (this: Record<string, unknown>) {
            saved = this;
            return this;
        });

        await processGroupSlot({ _id: groupId, name: "cron-group" }, slots[0], morningStart, 8 * 60);

        const attendees = ((saved as unknown as { attendees: Array<{ name: string; isManual: boolean }> }).attendees);
        assert.deepEqual(attendees.map((a) => [a.name, a.isManual]), [["active", false]]);
    });
});
