/**
 * @module ScheduleDraftsTests
 *
 * The published version of a schedule is what members see, what statistics count and what
 * vacation balances reflect. Edits wait in a draft until a publish succeeds, and a publish is
 * all-or-nothing and safe against concurrent writes.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import type { Request, Response } from "express";

import Group from "../models/Group";
import User from "../models/User";
import ShiftSchedule from "../models/ShiftSchedule";
import ShiftReport from "../models/ShiftReport";
import * as schedulesController from "../controllers/schedulesController";
import { planVacationCharges } from "../services/scheduleVacationPlan";
import { clearGroupCache } from "../utils/authHelpers";
import { getJerusalemDate, startOfJerusalemDay } from "../utils/jerusalemTime";

interface MockRes {
    statusCode: number;
    body: unknown;
    status: (code: number) => MockRes;
    json: (data: unknown) => MockRes;
}

function createMockRes(): MockRes {
    return {
        statusCode: 200,
        body: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data: unknown) {
            this.body = data;
            return this;
        },
    };
}

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
const VACATION = newId();
const MORNING = newId();
const vacationTypes = new Set([VACATION]);
const day = (d: number) => new Date(Date.UTC(2026, 9, d));

describe("planVacationCharges", () => {
    const alice = newId();

    it("charges every vacation day on a first publish and ignores other shift types", () => {
        const plan = planVacationCharges([], [
            { userId: alice, shiftTypeId: VACATION, date: day(12), vacationValue: 0.5 },
            { userId: alice, shiftTypeId: VACATION, date: day(13) },
            { userId: alice, shiftTypeId: MORNING, date: day(14) },
        ], vacationTypes);

        assert.equal(plan.users.length, 1);
        assert.equal(plan.users[0].net, -1.5);
        assert.deepEqual(plan.users[0].pending, [0, 1]);
        assert.ok(plan.shifts.every((s) => s.vacationDeducted === false), "nothing is marked charged before it is applied");
    });

    it("refunds a charged day that was removed or is no longer vacation", () => {
        const published = [
            { userId: alice, shiftTypeId: VACATION, date: day(12), vacationDeducted: true, vacationValue: 1 },
            { userId: alice, shiftTypeId: VACATION, date: day(13), vacationDeducted: true, vacationValue: 0.5 },
        ];
        const plan = planVacationCharges(published, [{ userId: alice, shiftTypeId: MORNING, date: day(13) }], vacationTypes);

        assert.equal(plan.users[0].removedRefund, 1.5);
        assert.equal(plan.users[0].net, 1.5);
    });

    it("carries an already charged day and settles only a change of value", () => {
        const published = [{ userId: alice, shiftTypeId: VACATION, date: day(12), vacationDeducted: true, vacationValue: 0.5 }];
        const plan = planVacationCharges(published, [{ userId: alice, shiftTypeId: VACATION, date: day(12), vacationValue: 1 }], vacationTypes);

        assert.deepEqual(plan.users[0].carried, [{ shiftIndex: 0, chargedValue: 0.5 }]);
        assert.deepEqual(plan.users[0].pending, []);
        assert.equal(plan.users[0].net, -0.5);
    });

    it("never charges an unchanged republish", () => {
        const published = [{ userId: alice, shiftTypeId: VACATION, date: day(12), vacationDeducted: true, vacationValue: 1 }];
        const plan = planVacationCharges(published, [{ userId: alice, shiftTypeId: VACATION, date: day(12), vacationValue: 1 }], vacationTypes);

        assert.equal(plan.users[0].net, 0);
    });
});

describe("publishSchedule: concurrency", () => {
    it("answers 409 SCHEDULE_CHANGED and aborts the transaction when the schedule changed meanwhile", async () => {
        const groupId = newId();
        const userId = newId();
        patch(Group, "findById", async () => ({ _id: groupId, name: `g-${groupId}`, settings: { shiftTypes: [{ _id: VACATION, isVacation: true }] } }));
        patch(ShiftSchedule, "findById", async () => ({
            _id: newId(),
            groupId,
            isPublished: false,
            revision: 2,
            shifts: [{ userId, shiftTypeId: VACATION, date: day(12), vacationValue: 1 }],
        }));
        patch(User, "find", async () => [{ _id: userId, username: "dana", vacationBalance: 5, isActive: true }]);
        patch(User, "findOneAndUpdate", async () => ({ _id: userId }));
        let aborted = false;
        patch(ShiftSchedule.db, "transaction", async (work: (session: unknown) => Promise<unknown>) => {
            try {
                return await work({});
            } catch (err) {
                aborted = true;
                throw err;
            }
        });
        // Another save or publish bumped the revision: the conditional commit matches nothing
        patch(ShiftSchedule, "findOneAndUpdate", async () => null);
        const res = createMockRes();

        await schedulesController.publishSchedule(
            { body: { scheduleId: newId() }, user: { _id: newId(), groups: [{ groupId, role: "shift_manager" }] } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        assert.equal(res.statusCode, 409);
        assert.equal((res.body as Record<string, unknown>).code, "SCHEDULE_CHANGED");
        assert.equal(aborted, true, "aborting the transaction undoes the day charged by this attempt");
    });
});

describe("published-only views", () => {
    const groupId = newId();
    const published = [{ userId: newId(), shiftTypeId: MORNING, date: day(12) }];
    const draft = [{ userId: newId(), shiftTypeId: MORNING, date: day(13) }];
    const storedSchedule = { _id: newId(), groupId, isPublished: true, shifts: published, draftShifts: draft };

    function mockSchedules(): { filters: Array<Record<string, unknown>> } {
        const captured = { filters: [] as Array<Record<string, unknown>> };
        patch(Group, "findById", async () => ({ _id: groupId, name: `views-${groupId}` }));
        patch(ShiftSchedule, "findOne", (filter: Record<string, unknown>) => {
            captured.filters.push(filter);
            return { sort: () => ({ lean: async () => storedSchedule }) };
        });
        patch(ShiftSchedule, "find", (filter: Record<string, unknown>) => {
            captured.filters.push(filter);
            return { select: () => ({ lean: async () => [storedSchedule] }) };
        });
        return captured;
    }

    it("members see only the published shifts, never the pending draft", async () => {
        mockSchedules();
        const res = createMockRes();
        await schedulesController.getSchedule(
            { query: { groupId, date: "2026-10-12" }, user: { _id: newId(), groups: [{ groupId, role: "member" }] } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        const body = res.body as Record<string, unknown>;
        assert.deepEqual(body.shifts, published);
        assert.equal("draftShifts" in body, false);
    });

    it("the Shift Manager works on the draft and is told it is unpublished", async () => {
        mockSchedules();
        const res = createMockRes();
        await schedulesController.getSchedule(
            { query: { groupId, date: "2026-10-12" }, user: { _id: newId(), groups: [{ groupId, role: "shift_manager" }] } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        const body = res.body as Record<string, unknown>;
        assert.deepEqual(body.shifts, draft);
        assert.deepEqual(body.publishedShifts, published);
        assert.equal(body.hasUnpublishedChanges, true);
    });

    it("statistics (GET /schedules/all) use published schedules only, for managers too", async () => {
        const captured = mockSchedules();
        const res = createMockRes();
        await schedulesController.getAllSchedules(
            { query: { groupId }, user: { _id: newId(), groups: [{ groupId, role: "shift_manager" }] } } as unknown as Request,
            res as unknown as Response,
            () => {},
        );

        assert.equal(captured.filters[0].isPublished, true);
        const [schedule] = res.body as Array<Record<string, unknown>>;
        assert.deepEqual(schedule.shifts, published);
        assert.equal("draftShifts" in schedule, false);
    });
});

// --- Saves and publishes that change nothing, and silent members ------------------------------

interface StoreSchedule {
    _id: string;
    groupId: string;
    isPublished: boolean;
    revision: number;
    startDate: Date;
    endDate: Date;
    shifts: Array<Record<string, unknown>>;
    draftShifts?: Array<Record<string, unknown>>;
}

interface Member { _id: string; username: string; vacationBalance: number; isActive?: boolean }

/**
 * Mocks one group with one stored schedule and a user store whose `find` honours the
 * `isActive` filter. Records every schedule write and whether a transaction was opened.
 */
function mockScheduleStore(schedule: StoreSchedule | null, members: Member[], groupId: string) {
    const state = { writes: [] as Array<{ filter: Record<string, unknown>; update: Record<string, Record<string, unknown>> }>, transactions: 0 };
    patch(Group, "findById", async () => ({ _id: groupId, name: `store-${groupId}`, settings: { shiftTypes: [{ _id: VACATION, isVacation: true }], timeSlots: [] } }));
    patch(ShiftSchedule, "findOne", async () => schedule);
    patch(ShiftSchedule, "findById", async () => schedule);
    patch(ShiftSchedule, "findOneAndUpdate", async (filter: Record<string, unknown>, update: Record<string, Record<string, unknown>>) => {
        // Honour the published/unpublished condition the controller writes under
        const published = Boolean(schedule?.isPublished);
        if ((filter.isPublished === true && !published) || (typeof filter.isPublished === "object" && published)) return null;
        state.writes.push({ filter, update });
        if (!schedule) return { _id: newId(), groupId, isPublished: false, revision: 1, ...update.$set };
        const next: Record<string, unknown> = { ...schedule, ...update.$set, revision: schedule.revision + 1 };
        for (const key of Object.keys(update.$unset ?? {})) delete next[key];
        return next;
    });
    patch(User, "find", async (filter: { _id: { $in: string[] }; isActive?: unknown }) =>
        members.filter((m) => filter._id.$in.includes(m._id) && (filter.isActive === undefined || m.isActive !== false)));
    patch(User, "findOneAndUpdate", async () => ({}));
    patch(User, "findByIdAndUpdate", async () => ({}));
    patch(ShiftReport, "find", async () => []);
    patch(ShiftSchedule.db, "transaction", async (work: (session: unknown) => Promise<unknown>) => {
        state.transactions++;
        return work({});
    });
    return state;
}

const manager = (groupId: string) => ({ _id: newId(), groups: [{ groupId, role: "shift_manager" }] });

/** A shift as the schedule page sends it (strings, no vacationDeducted). */
const sent = (shift: Record<string, unknown>) => ({
    userId: String(shift.userId),
    shiftTypeId: String(shift.shiftTypeId),
    date: (shift.date as Date).toISOString(),
    ...(shift.vacationValue !== undefined ? { vacationValue: shift.vacationValue } : {}),
});

async function save(groupId: string, schedule: StoreSchedule | null, shifts: Array<Record<string, unknown>>) {
    const res = createMockRes();
    await schedulesController.saveSchedule(
        {
            body: { groupId, startDate: (schedule?.startDate ?? day(11)).toISOString(), endDate: (schedule?.endDate ?? day(17)).toISOString(), shifts },
            user: manager(groupId),
        } as unknown as Request,
        res as unknown as Response,
        (err?: unknown) => assert.fail(`unexpected error: ${String(err)}`),
    );
    return res;
}

async function publishSchedule(groupId: string, schedule: StoreSchedule) {
    const res = createMockRes();
    await schedulesController.publishSchedule(
        { body: { scheduleId: schedule._id }, user: manager(groupId) } as unknown as Request,
        res as unknown as Response,
        (err?: unknown) => assert.fail(`unexpected error: ${String(err)}`),
    );
    return res;
}

describe("saving or publishing without a change writes nothing", () => {
    const alice: Member = { _id: newId(), username: "alice", vacationBalance: 5 };
    const publishedWeek = (groupId: string, draftShifts?: Array<Record<string, unknown>>): StoreSchedule => ({
        _id: newId(),
        groupId,
        isPublished: true,
        revision: 4,
        startDate: day(11),
        endDate: day(17),
        shifts: [
            { _id: newId(), userId: alice._id, shiftTypeId: MORNING, date: day(12), vacationValue: 1, vacationDeducted: false },
            { _id: newId(), userId: alice._id, shiftTypeId: VACATION, date: day(13), vacationValue: 1, vacationDeducted: true },
        ],
        ...(draftShifts ? { draftShifts } : {}),
    });

    it("a save identical to the published shifts neither sets draftShifts nor bumps the revision", async () => {
        const groupId = newId();
        const schedule = publishedWeek(groupId);
        const state = mockScheduleStore(schedule, [alice], groupId);

        // Non-vacation shifts arrive without vacationValue; the stored default (1) still compares equal
        const res = await save(groupId, schedule, [sent({ ...schedule.shifts[0], vacationValue: undefined }), sent(schedule.shifts[1])]);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(state.writes, []);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.revision, 4);
        assert.equal(body.hasUnpublishedChanges, false);
    });

    it("a save identical to the pending draft writes nothing", async () => {
        const groupId = newId();
        const draft = [{ userId: alice._id, shiftTypeId: MORNING, date: day(14), vacationValue: 1 }];
        const schedule = publishedWeek(groupId, draft);
        const state = mockScheduleStore(schedule, [alice], groupId);

        const res = await save(groupId, schedule, draft.map(sent));

        assert.deepEqual(state.writes, []);
        assert.equal((res.body as Record<string, unknown>).hasUnpublishedChanges, true);
    });

    it("a save that returns a published week to its published shifts only removes the draft", async () => {
        const groupId = newId();
        const schedule = publishedWeek(groupId, [{ userId: alice._id, shiftTypeId: MORNING, date: day(14), vacationValue: 1 }]);
        const state = mockScheduleStore(schedule, [alice], groupId);

        const res = await save(groupId, schedule, schedule.shifts.map(sent));

        assert.equal(state.writes.length, 1);
        assert.deepEqual(state.writes[0].update, { $unset: { draftShifts: 1 }, $inc: { revision: 1 } });
        assert.equal((res.body as Record<string, unknown>).hasUnpublishedChanges, false);
    });

    it("a save identical to an unpublished week writes nothing", async () => {
        const groupId = newId();
        const schedule: StoreSchedule = { ...publishedWeek(groupId), isPublished: false };
        const state = mockScheduleStore(schedule, [alice], groupId);

        await save(groupId, schedule, schedule.shifts.map(sent));

        assert.deepEqual(state.writes, []);
    });

    it("publishing a published week with no draft opens no transaction and answers unchanged", async () => {
        const groupId = newId();
        const schedule = publishedWeek(groupId);
        const state = mockScheduleStore(schedule, [alice], groupId);

        const res = await publishSchedule(groupId, schedule);

        assert.equal(res.statusCode, 200);
        assert.equal(state.transactions, 0);
        assert.deepEqual(state.writes, []);
        const body = res.body as Record<string, unknown>;
        assert.equal(body.unchanged, true);
        assert.equal(body.revision, 4);
    });

    it("publishing a draft equal to the published shifts removes the draft and changes no balance", async () => {
        const groupId = newId();
        const schedule = publishedWeek(groupId);
        schedule.draftShifts = schedule.shifts.map(({ userId, shiftTypeId, date, vacationValue }) => ({ userId, shiftTypeId, date, vacationValue }));
        const state = mockScheduleStore(schedule, [alice], groupId);
        let balanceWrites = 0;
        patch(User, "findOneAndUpdate", async () => {
            balanceWrites++;
            return {};
        });
        patch(User, "findByIdAndUpdate", async () => {
            balanceWrites++;
            return {};
        });

        const res = await publishSchedule(groupId, schedule);

        assert.equal(res.statusCode, 200);
        assert.equal(balanceWrites, 0);
        assert.equal(state.writes.length, 1);
        assert.deepEqual(state.writes[0].update, { $unset: { draftShifts: 1 }, $inc: { revision: 1 } });
        assert.equal((res.body as Record<string, unknown>).unchanged, true);
    });
});

describe("save and publish never change a silent member's shifts", () => {
    const active: Member = { _id: newId(), username: "active", vacationBalance: 5 };
    const former: Member = { _id: newId(), username: "former", vacationBalance: 0, isActive: false };

    it("a save that leaves out a silent member's published shifts keeps them", async () => {
        const groupId = newId();
        const formersDay = { _id: newId(), userId: former._id, shiftTypeId: VACATION, date: day(13), vacationValue: 1, vacationDeducted: true };
        const schedule: StoreSchedule = {
            _id: newId(), groupId, isPublished: true, revision: 1, startDate: day(11), endDate: day(17),
            shifts: [{ _id: newId(), userId: active._id, shiftTypeId: MORNING, date: day(12), vacationValue: 1 }, formersDay],
        };
        const state = mockScheduleStore(schedule, [active, former], groupId);
        const newShift = { userId: active._id, shiftTypeId: MORNING, date: day(14) };

        await save(groupId, schedule, [sent(schedule.shifts[0]), sent(newShift)]);

        assert.equal(state.writes.length, 1);
        const draft = state.writes[0].update.$set.draftShifts as Array<Record<string, unknown>>;
        assert.equal(draft.length, 3);
        assert.ok(draft.includes(formersDay), "the deactivated member's charged day is kept exactly as published");
    });

    it("a silent member's new vacation day in a request is ignored", async () => {
        const groupId = newId();
        const state = mockScheduleStore(null, [active, former], groupId);

        await save(groupId, null, [
            sent({ userId: active._id, shiftTypeId: MORNING, date: day(12) }),
            sent({ userId: former._id, shiftTypeId: VACATION, date: day(13), vacationValue: 1 }),
        ]);

        const shifts = state.writes.find((w) => w.update.$set?.shifts)?.update.$set.shifts as Array<Record<string, unknown>>;
        assert.deepEqual(shifts.map((s) => s.userId), [active._id]);
    });

    it("a publish keeps a silent member's charged day while settling an active member's change", async () => {
        const groupId = newId();
        const formersDay = { _id: newId(), userId: former._id, shiftTypeId: VACATION, date: day(13), vacationValue: 1, vacationDeducted: true };
        const schedule: StoreSchedule = {
            _id: newId(), groupId, isPublished: true, revision: 2, startDate: day(11), endDate: day(17),
            shifts: [formersDay],
            // The manager added a vacation day for the active member; the grid never showed the former one
            draftShifts: [{ userId: active._id, shiftTypeId: VACATION, date: day(14), vacationValue: 1 }],
        };
        const state = mockScheduleStore(schedule, [active, former], groupId);
        const charges: string[] = [];
        const refunds: string[] = [];
        patch(User, "findOneAndUpdate", async (filter: { _id: string }) => {
            charges.push(String(filter._id));
            return { _id: filter._id };
        });
        patch(User, "findByIdAndUpdate", async (id: unknown) => {
            refunds.push(String(id));
            return {};
        });

        const res = await publishSchedule(groupId, schedule);

        assert.equal(res.statusCode, 200);
        assert.deepEqual(charges, [active._id]);
        assert.deepEqual(refunds, [], "the former member's day is not refunded");
        const published = state.writes[0].update.$set.shifts as Array<Record<string, unknown>>;
        assert.deepEqual(
            published.map((s) => [s.userId, s.vacationDeducted]).sort(),
            [[active._id, true], [former._id, true]].sort(),
        );
    });
});

// --- Reports that already exist follow the latest publish ---------------------------------------

describe("reports from today onwards follow the latest publish", () => {
    const SLOT_TYPE = newId();
    const OTHER_TYPE = newId();

    it("replaces today's automatic attendees, keeps manual ones, and leaves yesterday's report alone", async () => {
        const groupId = newId();
        const now = new Date();
        const todayStart = startOfJerusalemDay(now);
        const yesterdayStart = startOfJerusalemDay(new Date(todayStart.getTime() - 12 * 3600 * 1000));
        const oldAuto: Member = { _id: newId(), username: "old-auto", vacationBalance: 0 };
        const newAuto: Member = { _id: newId(), username: "new-auto", vacationBalance: 0 };
        const manual: Member = { _id: newId(), username: "manual", vacationBalance: 0 };
        const offSlot: Member = { _id: newId(), username: "off-slot", vacationBalance: 0 };

        const slotStart = getJerusalemDate(now, "08:00");
        const reports = [
            {
                _id: newId(), date: slotStart, startTime: slotStart.toISOString(),
                attendees: [
                    { userId: oldAuto._id, name: oldAuto.username, isManual: false },
                    { userId: manual._id, name: manual.username, isManual: true },
                ],
            },
            {
                _id: newId(), date: getJerusalemDate(yesterdayStart, "08:00"), startTime: getJerusalemDate(yesterdayStart, "08:00").toISOString(),
                attendees: [{ userId: oldAuto._id, name: oldAuto.username, isManual: false }],
            },
        ];
        const schedule: StoreSchedule = {
            _id: newId(), groupId, isPublished: true, revision: 1,
            startDate: new Date(yesterdayStart.getTime() - 24 * 3600 * 1000), endDate: new Date(todayStart.getTime() + 5 * 24 * 3600 * 1000),
            shifts: [{ _id: newId(), userId: oldAuto._id, shiftTypeId: SLOT_TYPE, date: todayStart, vacationValue: 1 }],
            // Today's slot is now worked by someone else; another type that day is not in the slot
            draftShifts: [
                { userId: newAuto._id, shiftTypeId: SLOT_TYPE, date: todayStart },
                { userId: offSlot._id, shiftTypeId: OTHER_TYPE, date: todayStart },
            ],
        };
        mockScheduleStore(schedule, [oldAuto, newAuto, manual, offSlot], groupId);
        patch(Group, "findById", async () => ({
            _id: groupId,
            name: `reports-${groupId}`,
            settings: { shiftTypes: [], timeSlots: [{ name: "Morning", startTime: "08:00", endTime: "16:00", linkedShiftTypes: [SLOT_TYPE] }] },
        }));
        let reportFilter: { date: { $gte: Date; $lte?: Date } } | null = null;
        patch(ShiftReport, "find", async (filter: { date: { $gte: Date; $lte?: Date } }) => {
            reportFilter = filter;
            return reports.filter((r) => r.date >= filter.date.$gte && (!filter.date.$lte || r.date <= filter.date.$lte));
        });
        const updates: Array<{ id: string; attendees: Array<Record<string, unknown>> }> = [];
        patch(ShiftReport, "updateOne", async (filter: { _id: string }, update: { $set: { attendees: Array<Record<string, unknown>> } }) => {
            updates.push({ id: filter._id, attendees: update.$set.attendees });
            return {};
        });

        const res = await publishSchedule(groupId, schedule);

        assert.equal(res.statusCode, 200);
        assert.equal((reportFilter as unknown as { date: { $gte: Date } }).date.$gte.getTime(), todayStart.getTime(), "only reports from today");
        assert.deepEqual(updates.map((u) => u.id), [reports[0]._id], "yesterday's report is not touched");
        assert.deepEqual(
            updates[0].attendees.map((a) => [String(a.userId), a.isManual]),
            [[newAuto._id, false], [manual._id, true]],
        );
    });
});
