/**
 * @module ReportAttendees
 *
 * Works out a shift report's automatic attendees from a published schedule. One routine serves
 * the cron, manual report creation and the re-sync after a publish (or after a member leaves a
 * group), so all of them always agree:
 * - the report's day and time slot are read on Jerusalem time, whatever the server's time zone;
 * - only shifts of the types linked to the report's time slot count (every type when no slot
 *   matches the report's start, or the slot links none);
 * - only active members of the group are listed.
 */

import type { ClientSession, Types } from "mongoose";
import ShiftReport, { IShiftReportAttendee } from "../models/ShiftReport";
import User from "../models/User";
import { getJerusalemDateString, getTimeInJerusalem } from "../utils/jerusalemTime";

export interface AttendeeTimeSlot {
    readonly startTime: string;
    readonly linkedShiftTypes?: ReadonlyArray<unknown>;
}

export interface AttendeeShift {
    readonly userId: unknown;
    readonly date: unknown;
    readonly shiftTypeId: unknown;
}

export interface PublishedShifts {
    readonly startDate?: unknown;
    readonly endDate?: unknown;
    readonly shifts?: ReadonlyArray<AttendeeShift>;
}

/** A report's start may be this many minutes away from its time slot's start. */
const SLOT_MATCH_TOLERANCE_MINUTES = 5;

function idOf(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
}

function toDate(value: unknown): Date | null {
    if (value === undefined || value === null || value === "") return null;
    const date = value instanceof Date ? value : new Date(value as string | number);
    return isNaN(date.getTime()) ? null : date;
}

/** Awaits a query as a plain object (`lean`) when the query supports it. */
async function leanResult<T>(query: unknown): Promise<T | null> {
    const leanable = query as { lean?: () => unknown } | null;
    return (await (typeof leanable?.lean === "function" ? leanable.lean() : query)) as T | null;
}

/**
 * The group's time slot whose start (HH:mm) is within 5 minutes of `start` on Jerusalem
 * wall-clock time, or undefined when none is.
 */
export function matchTimeSlot<T extends AttendeeTimeSlot>(
    timeSlots: ReadonlyArray<T> | undefined,
    start: Date,
): T | undefined {
    const { hour, minute } = getTimeInJerusalem(start);
    const startMinutes = hour * 60 + minute;
    return (timeSlots ?? []).find((slot) => {
        if (!slot || typeof slot.startTime !== "string") return false;
        const [h, m] = slot.startTime.split(":").map(Number);
        if (isNaN(h) || isNaN(m)) return false;
        return Math.abs(h * 60 + m - startMinutes) < SLOT_MATCH_TOLERANCE_MINUTES;
    });
}

/**
 * Ids (deduplicated) of the users with a shift on `start`'s Jerusalem calendar day, of a type
 * linked to `slot`. Every type counts when there is no slot or the slot links none.
 */
export function scheduledUserIds(
    shifts: ReadonlyArray<AttendeeShift> | undefined,
    slot: AttendeeTimeSlot | undefined,
    start: Date,
): string[] {
    const linkedTypes = (slot?.linkedShiftTypes ?? []).map(idOf);
    const day = getJerusalemDateString(start);
    const ids = new Set<string>();
    for (const shift of shifts ?? []) {
        const shiftDate = toDate(shift?.date);
        if (!shift?.userId || !shiftDate || getJerusalemDateString(shiftDate) !== day) continue;
        if (linkedTypes.length > 0 && !linkedTypes.includes(idOf(shift.shiftTypeId))) continue;
        ids.add(idOf(shift.userId));
    }
    return [...ids];
}

/**
 * Loads the automatic attendee entries for `userIds`: only active members of the group, as
 * `{ userId, name, isManual: false }`.
 */
export async function loadAutomaticAttendees(
    groupId: Types.ObjectId | string,
    userIds: readonly string[],
    session?: ClientSession,
): Promise<IShiftReportAttendee[]> {
    if (userIds.length === 0) {
        return [];
    }
    const users = await leanResult<Array<{ _id: Types.ObjectId; username?: string }>>(
        User.find(
            { _id: { $in: userIds }, isActive: { $ne: false }, "groups.groupId": groupId },
            "_id username",
            session ? { session } : undefined,
        ),
    );
    return (Array.isArray(users) ? users : []).map((u) => ({ userId: u._id, name: u.username, isManual: false }));
}

/**
 * The attendees a report should list: the automatic ones, then every entry members added by hand
 * (`isManual: true`) that is not already listed.
 */
export function mergeAttendees(
    existing: ReadonlyArray<IShiftReportAttendee> | undefined,
    automatic: ReadonlyArray<IShiftReportAttendee>,
): IShiftReportAttendee[] {
    const listed = new Set(automatic.map((a) => idOf(a.userId)));
    const manual = (existing ?? []).filter((a) => a?.isManual === true && !(a.userId && listed.has(idOf(a.userId))));
    return [...automatic, ...manual];
}

function sameAttendees(a: ReadonlyArray<IShiftReportAttendee>, b: ReadonlyArray<IShiftReportAttendee>): boolean {
    const key = (x: IShiftReportAttendee) => `${x.userId ? idOf(x.userId) : ""}|${x.name ?? ""}|${x.isManual === true}`;
    return a.length === b.length && a.every((x, i) => key(x) === key(b[i]));
}

export interface ResyncReportAttendeesOptions {
    readonly groupId: Types.ObjectId | string;
    readonly timeSlots: ReadonlyArray<AttendeeTimeSlot> | undefined;
    /** Published schedules to read shifts from; each report uses the one covering its start. */
    readonly schedules: ReadonlyArray<PublishedShifts>;
    /** Only reports dated at or after this instant are touched (callers pass the start of today). */
    readonly from: Date;
    /** Optional upper bound on the report date. */
    readonly to?: Date;
    readonly session?: ClientSession;
}

/**
 * Re-computes the automatic attendees of the group's reports dated in [from, to] from the given
 * published schedules, keeping manual entries. Reports that no given schedule covers, and reports
 * whose attendees would not change, are not written. Writes run one after another, as operations
 * of one transaction must.
 *
 * @returns The number of reports updated.
 */
export async function resyncReportAttendees(options: ResyncReportAttendeesOptions): Promise<number> {
    const { groupId, timeSlots, schedules, from, session } = options;
    const to = options.to && !isNaN(options.to.getTime()) ? options.to : undefined;
    if (isNaN(from.getTime()) || (to && to.getTime() < from.getTime())) {
        return 0;
    }
    const reports = await leanResult<Array<{ _id: unknown; date?: unknown; startTime?: unknown; attendees?: IShiftReportAttendee[] }>>(
        ShiftReport.find(
            { groupId, date: { $gte: from, ...(to ? { $lte: to } : {}) } },
            "_id date startTime attendees",
            session ? { session } : undefined,
        ),
    );

    // Latest start first, so a schedule starting on the report's day wins over an older overlapping one
    const ordered = [...schedules].sort((a, b) => (toDate(b.startDate)?.getTime() ?? 0) - (toDate(a.startDate)?.getTime() ?? 0));
    const covering = (start: Date) => ordered.find((s) => {
        const begin = toDate(s.startDate);
        const end = toDate(s.endDate);
        return begin !== null && end !== null && begin.getTime() <= start.getTime() && end.getTime() >= start.getTime();
    });

    let updated = 0;
    for (const report of Array.isArray(reports) ? reports : []) {
        const start = toDate(report.startTime) ?? toDate(report.date);
        if (!start) continue;
        const schedule = covering(start);
        // Without a published schedule there is nothing to sync from: leave the report as it is
        if (!schedule) continue;
        const userIds = scheduledUserIds(schedule?.shifts, matchTimeSlot(timeSlots, start), start);
        const automatic = await loadAutomaticAttendees(groupId, userIds, session);
        const attendees = mergeAttendees(report.attendees, automatic);
        if (sameAttendees(attendees, report.attendees ?? [])) continue;
        await ShiftReport.updateOne({ _id: report._id }, { $set: { attendees } }, session ? { session } : undefined);
        updated++;
    }
    return updated;
}
