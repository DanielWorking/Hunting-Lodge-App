/**
 * @module MembershipCleanup
 *
 * What leaving a group does to that group's schedules. A member removed from a group (or a deleted
 * user) loses their shifts in it dated today or later on the Jerusalem calendar, in the published
 * shifts and in drafts alike; the vacation charged for the removed published shifts is refunded.
 * Earlier shifts stay, as history and for statistics. A deactivated member is different: they keep
 * every shift (see keepSilentMembersShifts), because they are expected back.
 *
 * Runs inside the caller's transaction, so the membership change, the schedules, the balance and
 * the report attendees change together or not at all.
 */

import type { ClientSession, Types } from "mongoose";
import ShiftSchedule, { IShiftAssignment } from "../models/ShiftSchedule";
import { ITimeSlot } from "../models/Group";
import { startOfJerusalemDay } from "../utils/jerusalemTime";
import { resyncReportAttendees } from "./reportAttendees";

interface StoredSchedule {
    _id: unknown;
    startDate: Date;
    endDate: Date;
    isPublished?: boolean;
    revision: number;
    shifts?: IShiftAssignment[];
    draftShifts?: IShiftAssignment[];
}

export interface LeaveGroupResult {
    /** Vacation days charged for the removed published shifts: what the user is owed back. */
    readonly refund: number;
    /** Schedules that lost at least one shift (each had its revision incremented). */
    readonly schedulesChanged: number;
}

function idOf(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
}

/** Awaits a query as a plain object (`lean`) when the query supports it. */
async function leanResult<T>(query: unknown): Promise<T | null> {
    const leanable = query as { lean?: () => unknown } | null;
    return (await (typeof leanable?.lean === "function" ? leanable.lean() : query)) as T | null;
}

/**
 * Removes `userId`'s shifts dated today or later from every schedule of the group, then re-syncs
 * the automatic attendees of the group's reports from today onwards. The caller refunds
 * `refund` (skipped when the user is deleted) and must already have taken the user out of the group
 * within the same session, so the re-sync no longer lists them.
 *
 * Each changed schedule gets its revision incremented, so a publish that read it before the
 * removal fails with 409 SCHEDULE_CHANGED instead of putting the shifts back or charging them again.
 */
export async function removeFromGroupSchedules(
    userId: string,
    groupId: Types.ObjectId | string,
    timeSlots: ReadonlyArray<ITimeSlot> | undefined,
    session: ClientSession,
    now: Date = new Date(),
): Promise<LeaveGroupResult> {
    const todayStart = startOfJerusalemDay(now);
    const schedules = await leanResult<StoredSchedule[]>(
        ShiftSchedule.find({ groupId, endDate: { $gte: todayStart } }, null, { session }),
    );

    const isRemoved = (shift: IShiftAssignment) =>
        idOf(shift.userId) === userId && new Date(shift.date).getTime() >= todayStart.getTime();

    let refund = 0;
    let schedulesChanged = 0;
    const publishedAfter: StoredSchedule[] = [];
    // Sequential on purpose: operations of one transaction must not run concurrently on its session
    for (const schedule of Array.isArray(schedules) ? schedules : []) {
        const shifts = schedule.shifts ?? [];
        const keptShifts = shifts.filter((shift) => !isRemoved(shift));
        const draft = Array.isArray(schedule.draftShifts) ? schedule.draftShifts : undefined;
        const keptDraft = draft?.filter((shift) => !isRemoved(shift));

        if (keptShifts.length !== shifts.length || (draft && keptDraft && keptDraft.length !== draft.length)) {
            if (schedule.isPublished) {
                // Only published shifts were ever charged; drafts and unpublished weeks never were
                refund += shifts
                    .filter((shift) => isRemoved(shift) && shift.vacationDeducted)
                    .reduce((sum, shift) => sum + (shift.vacationValue ?? 1), 0);
            }
            const result = await ShiftSchedule.updateOne(
                { _id: schedule._id, revision: schedule.revision },
                { $set: { shifts: keptShifts, ...(keptDraft ? { draftShifts: keptDraft } : {}) }, $inc: { revision: 1 } },
                { session },
            );
            if ((result as { matchedCount?: number } | null)?.matchedCount === 0) {
                throw new Error("A schedule changed while removing a member's shifts; nothing was changed");
            }
            schedulesChanged++;
        }
        if (schedule.isPublished) {
            publishedAfter.push({ ...schedule, shifts: keptShifts });
        }
    }

    await resyncReportAttendees({ groupId, timeSlots, schedules: publishedAfter, from: todayStart, session });
    return { refund, schedulesChanged };
}
