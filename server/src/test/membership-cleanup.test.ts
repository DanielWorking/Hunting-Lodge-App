/**
 * @module MembershipCleanupTests
 *
 * Leaving a group (PUT /users/:id dropping a group, or DELETE /users/:id) removes the member's
 * shifts in that group from today onwards and refunds the vacation charged for them, in one
 * transaction with the membership change. Deactivation keeps every shift.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import config from "../config";
import Group from "../models/Group";
import User from "../models/User";
import Site from "../models/Site";
import ShiftSchedule from "../models/ShiftSchedule";
import ShiftReport from "../models/ShiftReport";
import * as usersController from "../controllers/usersController";
import * as schedulesController from "../controllers/schedulesController";
import { clearGroupCache } from "../utils/authHelpers";
import { invalidateUserCache } from "../middleware/authMiddleware";
import { startOfJerusalemDay } from "../utils/jerusalemTime";
import { ADMIN_GROUP_ID } from "./adminGroupFixture";

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
    invalidateUserCache();
});

const newId = (): string => new mongoose.Types.ObjectId().toString();
const DAY_MS = 24 * 60 * 60 * 1000;
const VACATION = newId();
const MORNING = newId();

interface StoredShift { userId: string; shiftTypeId: string; date: Date; vacationValue?: number; vacationDeducted?: boolean }
interface StoredSchedule {
    _id: string; groupId: string; isPublished: boolean; revision: number; startDate: Date; endDate: Date;
    shifts: StoredShift[]; draftShifts?: StoredShift[];
}
interface StoredUser { _id: string; username: string; vacationBalance: number; isActive?: boolean; groups: Array<{ groupId: string; role: string }> }
interface StoredReport { _id: string; groupId: string; date: Date; startTime: string; attendees: Array<{ userId?: string; name?: string; isManual?: boolean }> }

interface Store {
    users: StoredUser[];
    groups: Array<{ _id: string; name: string; members: string[]; settings: { timeSlots: unknown[] } }>;
    schedules: StoredSchedule[];
    reports: StoredReport[];
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Mocks the models over an in-memory store. The mocked transaction restores the store when the
 * work throws, as MongoDB aborting a transaction would.
 */
function mockStore(store: Store, options: { failScheduleWrite?: boolean } = {}) {
    const calls = { transactions: 0, scheduleFinds: 0 };
    patch(User.db, "transaction", async (work: (session: unknown) => Promise<unknown>) => {
        calls.transactions++;
        const snapshot = clone(store);
        try {
            return await work({});
        } catch (err) {
            Object.assign(store, snapshot);
            throw err;
        }
    });
    const userById = (id: unknown) => store.users.find((u) => u._id === String(id)) ?? null;
    patch(User, "findById", async (id: unknown) => clone(userById(id)));
    patch(User, "findByIdAndUpdate", async (id: unknown, update: { $set?: Partial<StoredUser>; $inc?: Record<string, number> }) => {
        const user = userById(id);
        if (!user) return null;
        Object.assign(user, clone(update.$set ?? {}));
        for (const [key, by] of Object.entries(update.$inc ?? {})) {
            (user as unknown as Record<string, number>)[key] = ((user as unknown as Record<string, number>)[key] ?? 0) + by;
        }
        return clone(user);
    });
    patch(User, "findByIdAndDelete", async (id: unknown) => {
        const user = userById(id);
        store.users = store.users.filter((u) => u !== user);
        return user;
    });
    patch(User, "find", async (filter: { _id: { $in: string[] }; isActive?: unknown; "groups.groupId"?: unknown }) =>
        store.users
            .filter((u) => filter._id.$in.map(String).includes(u._id))
            .filter((u) => filter.isActive === undefined || u.isActive !== false)
            .filter((u) => filter["groups.groupId"] === undefined || u.groups.some((g) => g.groupId === String(filter["groups.groupId"])))
            .map((u) => ({ _id: new mongoose.Types.ObjectId(u._id), username: u.username, vacationBalance: u.vacationBalance })));
    patch(Group, "findById", async (id: unknown) => clone(store.groups.find((g) => g._id === String(id)) ?? null));
    patch(Group, "findOne", async () => null);
    patch(Group, "updateMany", async (filter: { _id?: { $in: string[] }; members?: string }, update: { $pull?: { members: unknown }; $addToSet?: { members: unknown } }) => {
        for (const group of store.groups) {
            const matches = filter._id ? filter._id.$in.includes(group._id) : group.members.includes(String(filter.members));
            if (!matches) continue;
            if (update.$pull) group.members = group.members.filter((m) => m !== String(update.$pull?.members));
            if (update.$addToSet && !group.members.includes(String(update.$addToSet.members))) group.members.push(String(update.$addToSet.members));
        }
    });
    patch(Site, "updateMany", async () => ({}));
    patch(ShiftSchedule, "find", async (filter: { groupId: string; endDate: { $gte: Date } }) => {
        calls.scheduleFinds++;
        return clone(store.schedules.filter((s) => s.groupId === String(filter.groupId) && s.endDate >= filter.endDate.$gte));
    });
    patch(ShiftSchedule, "findById", async (id: unknown) => clone(store.schedules.find((s) => s._id === String(id)) ?? null));
    patch(ShiftSchedule, "updateOne", async (filter: { _id: unknown; revision: unknown }, update: { $set: Partial<StoredSchedule>; $inc: { revision: number } }) => {
        if (options.failScheduleWrite) throw new Error("simulated database failure");
        const schedule = store.schedules.find((s) => s._id === String(filter._id) && s.revision === filter.revision);
        if (!schedule) return { matchedCount: 0 };
        Object.assign(schedule, clone(update.$set));
        schedule.revision += update.$inc.revision;
        return { matchedCount: 1 };
    });
    patch(ShiftSchedule, "findOneAndUpdate", async (filter: { _id: unknown; revision: unknown }) => {
        // A publish's conditional commit: only matches an unchanged revision
        const schedule = store.schedules.find((s) => s._id === String(filter._id) && s.revision === filter.revision);
        return schedule ? clone(schedule) : null;
    });
    patch(ShiftReport, "find", async (filter: { groupId: string; date: { $gte: Date } }) =>
        clone(store.reports.filter((r) => r.groupId === String(filter.groupId) && r.date >= filter.date.$gte)));
    patch(ShiftReport, "updateOne", async (filter: { _id: string }, update: { $set: { attendees: StoredReport["attendees"] } }) => {
        const report = store.reports.find((r) => r._id === String(filter._id));
        if (report) report.attendees = update.$set.attendees.map((a) => ({ ...a, userId: a.userId ? String(a.userId) : undefined }));
    });
    return calls;
}

const admin = () => ({ _id: newId(), username: config.superAdmin.username, groups: [{ groupId: ADMIN_GROUP_ID }] });

function scenario() {
    const today = startOfJerusalemDay();
    const yesterday = new Date(today.getTime() - DAY_MS);
    const nextWeek = new Date(today.getTime() + 7 * DAY_MS);
    const groupA = newId();
    const groupB = newId();
    const dana: StoredUser = {
        _id: newId(), username: "dana", vacationBalance: 3,
        groups: [{ groupId: groupA, role: "member" }, { groupId: groupB, role: "member" }],
    };
    const colleague: StoredUser = { _id: newId(), username: "colleague", vacationBalance: 0, groups: [{ groupId: groupA, role: "member" }] };
    const manual: StoredUser = { _id: newId(), username: "manual", vacationBalance: 0, groups: [{ groupId: groupA, role: "member" }] };
    const slot = { name: "Morning", startTime: "08:00", endTime: "16:00", linkedShiftTypes: [MORNING] };
    const store: Store = {
        users: [dana, colleague, manual],
        groups: [
            { _id: groupA, name: `a-${groupA}`, members: [dana._id, colleague._id, manual._id], settings: { timeSlots: [slot] } },
            { _id: groupB, name: `b-${groupB}`, members: [dana._id], settings: { timeSlots: [] } },
        ],
        schedules: [
            {
                // The current week of group A: yesterday's and today's shifts, published and charged
                _id: newId(), groupId: groupA, isPublished: true, revision: 3,
                startDate: new Date(today.getTime() - 3 * DAY_MS), endDate: new Date(today.getTime() + 3 * DAY_MS),
                shifts: [
                    { userId: dana._id, shiftTypeId: MORNING, date: yesterday, vacationValue: 1 },
                    { userId: dana._id, shiftTypeId: MORNING, date: today, vacationValue: 1 },
                    { userId: colleague._id, shiftTypeId: MORNING, date: today, vacationValue: 1 },
                ],
                draftShifts: [{ userId: dana._id, shiftTypeId: MORNING, date: new Date(today.getTime() + DAY_MS) }],
            },
            {
                // Next week of group A: a charged half day and a charged full day
                _id: newId(), groupId: groupA, isPublished: true, revision: 1,
                startDate: new Date(nextWeek.getTime() - DAY_MS), endDate: new Date(nextWeek.getTime() + 5 * DAY_MS),
                shifts: [
                    { userId: dana._id, shiftTypeId: VACATION, date: nextWeek, vacationValue: 1, vacationDeducted: true },
                    { userId: dana._id, shiftTypeId: VACATION, date: new Date(nextWeek.getTime() + DAY_MS), vacationValue: 0.5, vacationDeducted: true },
                ],
            },
            {
                // Group B: must not be touched when Dana leaves group A only
                _id: newId(), groupId: groupB, isPublished: true, revision: 1,
                startDate: new Date(today.getTime() - DAY_MS), endDate: new Date(today.getTime() + 5 * DAY_MS),
                shifts: [{ userId: dana._id, shiftTypeId: VACATION, date: nextWeek, vacationValue: 1, vacationDeducted: true }],
            },
        ],
        reports: [
            {
                _id: newId(), groupId: groupA, date: new Date(today.getTime() + 5 * 3600 * 1000),
                startTime: new Date(today.getTime() + 8 * 3600 * 1000).toISOString(),
                attendees: [
                    { userId: dana._id, name: "dana", isManual: false },
                    { userId: colleague._id, name: "colleague", isManual: false },
                    { userId: manual._id, name: "manual", isManual: true },
                ],
            },
        ],
    };
    return { store, dana, colleague, groupA, groupB, today, yesterday };
}

async function removeFromGroup(userId: string, keepGroups: Array<{ groupId: string; role: string }>) {
    const res = { statusCode: 200, body: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.body = data; return this; } };
    let error: unknown = null;
    await usersController.updateUser(
        { params: { id: userId }, body: { groups: keepGroups }, user: admin() } as unknown as Request,
        res as unknown as Response,
        (err?: unknown) => {
            error = err;
        },
    );
    return { res, error };
}

const shiftsOf = (store: Store, userId: string, groupId: string) =>
    store.schedules
        .filter((s) => s.groupId === groupId)
        .flatMap((s) => [...s.shifts, ...(s.draftShifts ?? [])])
        .filter((shift) => shift.userId === userId);

describe("leaving a group removes the member's shifts from today onwards", () => {
    it("removes today's and later shifts in that group, keeps earlier ones and other groups, refunds once", async () => {
        const { store, dana, groupA, groupB, today, yesterday } = scenario();
        mockStore(store);

        const { res, error } = await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);

        assert.equal(error, null);
        assert.equal(res.statusCode, 200);
        const remaining = shiftsOf(store, dana._id, groupA);
        assert.deepEqual(remaining.map((s) => s.date.getTime()), [yesterday.getTime()], "only yesterday's shift stays");
        assert.ok(remaining.every((s) => s.date < today));
        assert.equal(shiftsOf(store, dana._id, groupB).length, 1, "the other group is untouched");
        assert.equal(store.users[0].vacationBalance, 3 + 1.5, "the charged 1 + 0.5 days are refunded");
        assert.equal((res.body as Record<string, unknown>).username, "dana");
        assert.deepEqual(store.groups[0].members.includes(dana._id), false, "Group.members follows");
        assert.deepEqual(store.schedules.map((s) => s.revision), [4, 2, 1], "every changed schedule moves to a new revision");
    });

    it("drops the member from today's report as an automatic attendee and keeps manual entries", async () => {
        const { store, dana, groupB } = scenario();
        mockStore(store);

        await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);

        assert.deepEqual(store.reports[0].attendees.map((a) => [a.name, a.isManual]), [["colleague", false], ["manual", true]]);
    });

    it("refunds nothing more when the same removal is sent again", async () => {
        const { store, dana, groupB } = scenario();
        mockStore(store);

        await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);
        const calls = mockStore(store);
        await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);

        assert.equal(store.users[0].vacationBalance, 4.5);
        assert.equal(calls.scheduleFinds, 0, "no group is left the second time");
    });

    it("makes a publish that read the schedule before the removal fail with 409", async () => {
        const { store, dana, groupB } = scenario();
        mockStore(store);
        const currentWeek = store.schedules[0];
        // The publish read revision 3 (and the manager confirmed it) before the removal moved it on
        patch(ShiftSchedule, "findById", (() => {
            let first = true;
            return async () => {
                if (first) {
                    first = false;
                    return clone({ ...currentWeek, revision: 3 });
                }
                return clone(store.schedules[0]);
            };
        })());
        await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);
        patch(ShiftSchedule.db, "transaction", async (work: (session: unknown) => Promise<unknown>) => work({}));
        const res = { statusCode: 200, body: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.body = data; return this; } };

        await schedulesController.publishSchedule(
            { body: { scheduleId: currentWeek._id, revision: 3 }, user: { _id: newId(), groups: [{ groupId: currentWeek.groupId, role: "shift_manager" }] } } as unknown as Request,
            res as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );

        assert.equal(res.statusCode, 409);
        assert.equal((res.body as Record<string, unknown>).code, "SCHEDULE_CHANGED");
    });

    it("changes nothing when a step fails: membership, schedules and balance stay as they were", async () => {
        const { store, dana, groupA, groupB } = scenario();
        const before = clone(store);
        mockStore(store, { failScheduleWrite: true });

        const { error } = await removeFromGroup(dana._id, [{ groupId: groupB, role: "member" }]);

        assert.ok(error instanceof Error, "the failure reaches the error handler");
        assert.deepEqual(store.users[0].groups.map((g) => g.groupId), [groupA, groupB], "still a member");
        assert.equal(store.users[0].vacationBalance, before.users[0].vacationBalance);
        assert.deepEqual(store.schedules, before.schedules);
        assert.ok(store.groups[0].members.includes(dana._id));
    });

    it("deleting a user removes their future shifts in every group and attempts no refund", async () => {
        const { store, dana, groupA, groupB, yesterday } = scenario();
        const calls = mockStore(store);
        const res = { statusCode: 200, body: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.body = data; return this; } };

        await usersController.deleteUser(
            { params: { id: dana._id }, user: admin() } as unknown as Request,
            res as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );

        assert.deepEqual(res.body, { message: "User deleted" });
        assert.equal(calls.transactions, 1);
        assert.deepEqual(shiftsOf(store, dana._id, groupA).map((s) => s.date.getTime()), [yesterday.getTime()]);
        assert.deepEqual(shiftsOf(store, dana._id, groupB), []);
        assert.equal(store.users.some((u) => u._id === dana._id), false);
    });

    it("deactivation is not removal: every shift stays", async () => {
        const { store, dana } = scenario();
        const before = clone(store.schedules);
        const calls = mockStore(store);
        const res = { statusCode: 200, body: null as unknown, status(code: number) { this.statusCode = code; return this; }, json(data: unknown) { this.body = data; return this; } };

        await usersController.updateUser(
            { params: { id: dana._id }, body: { isActive: false }, user: admin() } as unknown as Request,
            res as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );

        assert.equal(res.statusCode, 200);
        assert.equal(store.users[0].isActive, false);
        assert.equal(calls.scheduleFinds, 0);
        assert.deepEqual(store.schedules, before);
    });
});
