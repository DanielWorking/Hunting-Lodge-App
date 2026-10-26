/**
 * @module SchedulesController
 * 
 * Handlers for managing shift schedules.
 * Saving only writes a draft (for a published schedule: `draftShifts`) and never touches
 * vacation balances. Publishing settles balances against the last published version and
 * commits atomically (revision check), so balances always match the last successful publish.
 * A publish also re-syncs the automatic attendees of the group's reports from today onwards.
 *
 * Only active members of the group (its Shift Manager included) appear in a schedule: save and
 * publish never change anyone else's shifts (see keepSilentMembersShifts). Saving or publishing
 * without a change writes nothing.
 *
 * Enforces strict role checks: only explicit Shift Managers of a group can
 * view drafts, save schedules, and publish schedules.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import ShiftSchedule, { IShiftAssignment } from "../models/ShiftSchedule";
import User from "../models/User";
import { IShiftType, ITimeSlot } from "../models/Group";
import { isShiftManager, resolveGroup, AuthUser } from "../utils/authHelpers";
import { startOfJerusalemDay } from "../utils/jerusalemTime";
import {
    planVacationCharges,
    keepSilentMembersShifts,
    sameShifts,
    shiftUserIds,
    VacationPlan,
    UserVacationPlan,
} from "../services/scheduleVacationPlan";
import { resyncReportAttendees } from "../services/reportAttendees";

export interface GetScheduleRequestQuery {
    groupId?: string;
    date?: string;
}

export interface SaveScheduleRequestBody {
    groupId?: string;
    startDate?: string;
    endDate?: string;
    shifts?: IShiftAssignment[];
    [key: string]: unknown;
}

export interface PublishScheduleRequestBody {
    scheduleId?: string;
    /** The revision the manager confirmed; publishing fails with 409 if the schedule moved on. */
    revision?: number;
}

export interface GetAllSchedulesRequestQuery {
    groupId?: string;
}

export interface ScheduleFilterCriteria {
    groupId: Types.ObjectId | string;
    startDate: { $lte: Date };
    endDate: { $gte: Date };
    isPublished?: boolean;
}

type ScheduleRecord = Record<string, unknown> & {
    _id?: unknown;
    startDate: Date;
    endDate: Date;
    isPublished?: boolean;
    shifts?: IShiftAssignment[];
    draftShifts?: IShiftAssignment[];
    revision: number;
};

/**
 * What a group's Shift Manager sees: the working copy. For a published schedule with
 * unpublished edits, `shifts` is the draft and `publishedShifts` is what members currently see.
 */
function toManagerView(schedule: ScheduleRecord): Record<string, unknown> {
    const { draftShifts, ...rest } = schedule;
    const hasUnpublishedChanges = Boolean(schedule.isPublished && Array.isArray(draftShifts));
    return {
        ...rest,
        shifts: hasUnpublishedChanges ? draftShifts : schedule.shifts,
        hasUnpublishedChanges,
        ...(hasUnpublishedChanges ? { publishedShifts: schedule.shifts } : {}),
    };
}

/** What everyone else sees: only the last successful publish, never pending edits. */
function toPublishedView(schedule: ScheduleRecord): Record<string, unknown> {
    const { draftShifts, ...published } = schedule;
    return published;
}

/**
 * A vacation charge that could not be applied on publish: an active member of the group lacks
 * the days. Any such shortfall blocks the whole publish.
 */
export interface VacationShortfall {
    userId: string;
    requiredBalance: number;
    reason: "INSUFFICIENT_BALANCE";
    username?: string;
    availableBalance?: number;
}

interface GroupMemberBalance {
    username?: string;
    vacationBalance?: number;
}

/** Awaits a query as a plain object (`lean`) when the query supports it. */
async function leanResult<T>(query: unknown): Promise<T | null> {
    const leanable = query as { lean?: () => unknown } | null;
    return (await (typeof leanable?.lean === "function" ? leanable.lean() : query)) as T | null;
}

/**
 * Loads which of `userIds` are active members of the group (any role, the Shift Manager
 * included). Nobody else's balance is ever read, charged or disclosed.
 */
async function loadActiveMembers(
    userIds: readonly string[],
    groupId: Types.ObjectId | string,
    session?: ClientSession,
): Promise<Map<string, GroupMemberBalance>> {
    if (userIds.length === 0) {
        return new Map();
    }
    const users = await leanResult<Array<GroupMemberBalance & { _id: unknown }>>(
        User.find(
            { _id: { $in: userIds }, isActive: { $ne: false }, "groups.groupId": groupId },
            "username vacationBalance",
            session ? { session } : undefined,
        ),
    );
    return new Map((Array.isArray(users) ? users : []).map((u) => [String(u._id), u]));
}

/**
 * Applies the silent-member rule to the shifts about to be saved or published, against the
 * group's membership right now (it can change between a save and a publish).
 */
async function shiftsForActiveMembers(
    incoming: readonly IShiftAssignment[],
    published: readonly IShiftAssignment[],
    groupId: Types.ObjectId | string,
    session?: ClientSession,
): Promise<{ shifts: IShiftAssignment[]; members: Map<string, GroupMemberBalance> }> {
    const members = await loadActiveMembers(shiftUserIds(incoming, published), groupId, session);
    return { shifts: keepSilentMembersShifts(incoming, published, (userId) => members.has(userId)), members };
}

function describeShortfall(shortfall: VacationShortfall): string {
    const available = shortfall.availableBalance !== undefined ? `, has ${shortfall.availableBalance}` : "";
    return `${shortfall.username || shortfall.userId} (needs ${shortfall.requiredBalance}${available})`;
}

/**
 * Applies one group member's net vacation change inside the publish transaction. A net refund
 * always succeeds; a net charge succeeds only while the balance covers it.
 *
 * @returns Whether the member's whole plan was applied.
 */
async function settleMemberVacation(
    userPlan: UserVacationPlan,
    groupId: Types.ObjectId | string,
    session: ClientSession,
): Promise<boolean> {
    if (userPlan.net >= 0) {
        if (userPlan.net > 0) {
            await User.findByIdAndUpdate(userPlan.userId, { $inc: { vacationBalance: userPlan.net } }, { session });
        }
        return true;
    }
    const charge = -userPlan.net;
    const charged = await User.findOneAndUpdate(
        { _id: userPlan.userId, "groups.groupId": groupId, vacationBalance: { $gte: charge } },
        { $inc: { vacationBalance: -charge } },
        { returnDocument: "after", session },
    );
    return Boolean(charged);
}

type PublishAttempt =
    | { status: "insufficient"; insufficientBalances: VacationShortfall[] }
    | { status: "conflict" }
    | { status: "published"; schedule: ScheduleRecord; unchanged: boolean };

/** Thrown inside the publish transaction to abort it; carries the result to report. */
class PublishAborted extends Error {
    constructor(readonly attempt: Exclude<PublishAttempt, { status: "published" }>) {
        super(`Publish aborted: ${attempt.status}`);
        this.name = "PublishAborted";
    }
}

/**
 * Applies the vacation plan and commits the publish within `session`'s transaction. Returns
 * "insufficient" or "conflict" without committing; the caller then aborts the transaction, which
 * undoes every balance change made here.
 *
 * @param members - The plan's users who are active members of the group. Everyone else's shifts
 *                  are their published ones, unchanged (keepSilentMembersShifts): what they were
 *                  charged stays charged and nothing new is charged or refunded.
 */
async function applyPlanAndCommit(
    schedule: ScheduleRecord,
    groupId: Types.ObjectId | string,
    plan: VacationPlan,
    members: ReadonlyMap<string, GroupMemberBalance>,
    session: ClientSession,
): Promise<PublishAttempt> {
    const outcomes = new Map<number, { vacationDeducted: true }>();
    const insufficientBalances: VacationShortfall[] = [];

    // Sequential on purpose: operations of one transaction must not run concurrently on its session
    for (const userPlan of plan.users) {
        const member = members.get(userPlan.userId);
        if (!member) {
            for (const carried of userPlan.carried) outcomes.set(carried.shiftIndex, { vacationDeducted: true });
            continue;
        }
        if (await settleMemberVacation(userPlan, groupId, session)) {
            for (const carried of userPlan.carried) outcomes.set(carried.shiftIndex, { vacationDeducted: true });
            for (const shiftIndex of userPlan.pending) outcomes.set(shiftIndex, { vacationDeducted: true });
            continue;
        }
        insufficientBalances.push({
            userId: userPlan.userId,
            requiredBalance: -userPlan.net,
            reason: "INSUFFICIENT_BALANCE",
            ...(member.username ? { username: member.username } : {}),
            ...(typeof member.vacationBalance === "number" ? { availableBalance: member.vacationBalance } : {}),
        });
    }

    if (insufficientBalances.length > 0) {
        return { status: "insufficient", insufficientBalances };
    }

    const shiftsToPublish = plan.shifts.map((shift, index) => ({ ...shift, ...outcomes.get(index) }));
    // Commit only if nobody saved or published this schedule since it was read
    const committed = await leanResult<ScheduleRecord>(
        ShiftSchedule.findOneAndUpdate(
            { _id: schedule._id, revision: schedule.revision },
            { $set: { shifts: shiftsToPublish, isPublished: true }, $unset: { draftShifts: 1 }, $inc: { revision: 1 } },
            { returnDocument: "after", runValidators: true, session },
        ),
    );
    if (!committed) {
        return { status: "conflict" };
    }
    return { status: "published", schedule: committed, unchanged: false };
}

/**
 * Drops the pending draft of a published schedule when that draft changes nothing members see.
 * Balances are untouched. Conditional on the revision that was read, like a publish.
 */
async function discardDraftOnPublish(schedule: ScheduleRecord, session: ClientSession): Promise<PublishAttempt> {
    const committed = await leanResult<ScheduleRecord>(
        ShiftSchedule.findOneAndUpdate(
            { _id: schedule._id, revision: schedule.revision },
            { $unset: { draftShifts: 1 }, $inc: { revision: 1 } },
            { returnDocument: "after", session },
        ),
    );
    return committed ? { status: "published", schedule: committed, unchanged: true } : { status: "conflict" };
}

/**
 * Saves a draft without ever touching vacation balances. For a published schedule only
 * `draftShifts` changes; otherwise the unpublished schedule itself is upserted. That upsert is
 * conditional on the schedule still being unpublished: if a publish lands in between, it hits the
 * unique (groupId, startDate) index and the save is redone as a draft of the now-published
 * schedule, so a save can never overwrite published (already charged) shifts.
 *
 * Only active members' shifts are taken from the request (keepSilentMembersShifts). A save that
 * changes nothing writes nothing and keeps the revision; one that brings a published schedule back
 * to exactly its published shifts only removes the pending draft.
 */
async function saveDraft(
    groupId: Types.ObjectId | string,
    startDate: string | undefined,
    endDate: string | undefined,
    incoming: IShiftAssignment[] | undefined,
): Promise<ScheduleRecord | null> {
    const existing = await leanResult<ScheduleRecord>(ShiftSchedule.findOne({ groupId, startDate }));
    const published = existing?.isPublished ? existing.shifts ?? [] : [];
    const { shifts } = await shiftsForActiveMembers(incoming ?? [], published, groupId);

    if (existing?.isPublished) {
        const pendingDraft = Array.isArray(existing.draftShifts) ? existing.draftShifts : undefined;
        if (sameShifts(shifts, published)) {
            // Back to exactly what members see: nothing to save, and a pending draft is obsolete
            const withoutDraft = pendingDraft
                ? await leanResult<ScheduleRecord>(
                    ShiftSchedule.findOneAndUpdate(
                        { _id: existing._id, isPublished: true },
                        { $unset: { draftShifts: 1 }, $inc: { revision: 1 } },
                        { returnDocument: "after" },
                    ),
                )
                : null;
            return withoutDraft ?? existing;
        }
        if (pendingDraft && sameShifts(shifts, pendingDraft)) {
            return existing;
        }
    } else if (existing && sameShifts(shifts, existing.shifts ?? [])) {
        return existing;
    }

    // runValidators: update operations skip schema validators (enums, required, casts) by default
    const saveAsDraftOfPublished = () => leanResult<ScheduleRecord>(
        ShiftSchedule.findOneAndUpdate(
            { groupId, startDate, isPublished: true },
            { $set: { draftShifts: shifts }, $inc: { revision: 1 } },
            { returnDocument: "after", runValidators: true },
        ),
    );

    const upsertUnpublished = () => leanResult<ScheduleRecord>(
        ShiftSchedule.findOneAndUpdate(
            { groupId, startDate, isPublished: { $ne: true } },
            { $set: { groupId, startDate, endDate, shifts }, $setOnInsert: { isPublished: false }, $inc: { revision: 1 } },
            { returnDocument: "after", upsert: true, runValidators: true },
        ),
    );

    const savedAsDraft = await saveAsDraftOfPublished();
    if (savedAsDraft) {
        return savedAsDraft;
    }
    try {
        return await upsertUnpublished();
    } catch (err: unknown) {
        if ((err as { code?: number } | null)?.code !== 11000) {
            throw err;
        }
        // Someone created or published this week concurrently: save as a draft if it is now
        // published, otherwise update the unpublished schedule they just created. Publishing
        // re-applies the silent-member rule, so a draft built against stale membership is safe.
        return (await saveAsDraftOfPublished()) ?? upsertUnpublished();
    }
}

export interface AllSchedulesFilterCriteria {
    groupId: Types.ObjectId | string;
    isPublished?: boolean;
}

export async function getSchedule(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetScheduleRequestQuery;
        const { groupId, date } = query;
        if (!groupId || !date || typeof groupId !== "string" || typeof date !== "string") {
            res.status(400).json({ message: "Missing groupId or date", code: "VALIDATION_ERROR" });
            return;
        }

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            res.status(400).json({ message: "date must be a valid ISO 8601 date", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Permission check: Only explicit shift managers of this group can view draft schedules
        const canViewDrafts = await isShiftManager(requestingUser, group._id);

        // Match the schedule whose range covers `date` (its start, its end or any day between)
        const scheduleFilter: ScheduleFilterCriteria = {
            groupId: group._id,
            startDate: { $lte: targetDate },
            endDate: { $gte: targetDate },
        };

        if (!canViewDrafts) {
            scheduleFilter.isPublished = true;
        }

        // Latest start first, so a schedule starting on `date` wins over any older overlapping one
        let scheduleQuery: any = ShiftSchedule.findOne(scheduleFilter);
        if (typeof scheduleQuery?.sort === "function") {
            const sorted = scheduleQuery.sort({ startDate: -1 });
            if (sorted) scheduleQuery = sorted;
        }
        const schedule = await (typeof scheduleQuery?.lean === "function"
            ? scheduleQuery.lean()
            : scheduleQuery);
        if (!schedule) {
            res.status(404).json({ message: "No schedule found for this date", code: "NOT_FOUND" });
            return;
        }
        res.json(canViewDrafts ? toManagerView(schedule) : toPublishedView(schedule));
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function saveSchedule(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as SaveScheduleRequestBody;
        const { groupId, startDate, endDate, shifts } = body;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Strict Authorization: Only an explicit shift manager of this group can save schedules
        const userIsManager = await isShiftManager(requestingUser, group._id);
        if (!userIsManager) {
            res.status(403).json({
                message: "Forbidden: You must be an explicit Shift Manager of this group to save schedules.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
            return;
        }

        const schedule = await saveDraft(group._id, startDate, endDate, shifts);
        if (!schedule) {
            res.status(404).json({ message: "Schedule not found", code: "NOT_FOUND" });
            return;
        }

        res.json(toManagerView(schedule));
    } catch (err: unknown) {
        console.error("Error saving schedule:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

const SCHEDULE_CHANGED_RESPONSE = {
    message: "The schedule changed while it was being published. Reload it and publish again.",
    code: "SCHEDULE_CHANGED",
} as const;

export async function publishSchedule(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as PublishScheduleRequestBody;
        const { scheduleId, revision: confirmedRevision } = body;
        if (!scheduleId || typeof scheduleId !== "string") {
            res.status(400).json({ message: "Missing scheduleId", code: "VALIDATION_ERROR" });
            return;
        }

        const existing = await leanResult<ScheduleRecord>(ShiftSchedule.findById(scheduleId));
        if (!existing) {
            res.status(404).json({ message: "Schedule not found", code: "NOT_FOUND" });
            return;
        }

        const group = await resolveGroup(existing.groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found for schedule", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Strict Authorization: Only an explicit shift manager of this group can publish schedules
        const userIsManager = await isShiftManager(requestingUser, group._id);
        if (!userIsManager) {
            res.status(403).json({
                message: "Forbidden: You must be an explicit Shift Manager of this group to publish schedules.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
            return;
        }

        // The manager confirmed one specific version; never publish a newer draft in its place
        if (typeof confirmedRevision === "number" && existing.revision !== confirmedRevision) {
            res.status(409).json(SCHEDULE_CHANGED_RESPONSE);
            return;
        }

        // A published week with no pending draft has nothing to publish: answer with what is there
        if (existing.isPublished && !Array.isArray(existing.draftShifts)) {
            res.json({ ...toManagerView(existing), unchanged: true });
            return;
        }

        const settings = group.settings as { shiftTypes?: IShiftType[]; timeSlots?: ITimeSlot[] } | undefined;
        const vacationTypeIds = new Set(
            (settings?.shiftTypes || []).filter((t) => Boolean(t.isVacation)).map((t) => t._id?.toString() || ""),
        );

        // One transaction: every balance change, the commit and the report re-sync happen together
        // or not at all, even if the process dies midway. A concurrent save or publish makes this
        // one abort as a conflict.
        let attempt: PublishAttempt;
        try {
            attempt = await ShiftSchedule.db.transaction(async (session: ClientSession) => {
                const current = await leanResult<ScheduleRecord>(ShiftSchedule.findById(existing._id, null, { session }));
                if (!current || current.revision !== existing.revision) {
                    throw new PublishAborted({ status: "conflict" });
                }
                // Publish the pending draft (before the first publish: the shifts themselves) against
                // the published shifts, which are exactly what the vacation balances reflect
                const publishedShifts = current.isPublished ? current.shifts ?? [] : [];
                const pendingShifts = current.isPublished && Array.isArray(current.draftShifts)
                    ? current.draftShifts
                    : current.shifts ?? [];
                // Membership may have changed since the draft was saved: apply the rule again, now
                const { shifts: targetShifts, members } = await shiftsForActiveMembers(
                    pendingShifts,
                    publishedShifts,
                    group._id,
                    session,
                );

                if (current.isPublished && sameShifts(targetShifts, publishedShifts)) {
                    const discarded = await discardDraftOnPublish(current, session);
                    if (discarded.status !== "published") {
                        throw new PublishAborted(discarded);
                    }
                    return discarded;
                }

                const plan = planVacationCharges(publishedShifts, targetShifts, vacationTypeIds);
                const result = await applyPlanAndCommit(current, group._id, plan, members, session);
                if (result.status !== "published") {
                    throw new PublishAborted(result);
                }

                // Reports from today (Jerusalem) within this schedule follow the new publish. Earlier
                // reports record who actually worked and stay as they are.
                const todayStart = startOfJerusalemDay();
                const scheduleStart = new Date(result.schedule.startDate);
                await resyncReportAttendees({
                    groupId: group._id,
                    timeSlots: settings?.timeSlots,
                    schedules: [result.schedule],
                    from: scheduleStart.getTime() > todayStart.getTime() ? scheduleStart : todayStart,
                    to: new Date(result.schedule.endDate),
                    session,
                });
                return result;
            });
        } catch (transactionErr: unknown) {
            if (!(transactionErr instanceof PublishAborted)) {
                throw transactionErr;
            }
            attempt = transactionErr.attempt;
        }

        // Anything short of a committed publish leaves balances and the published schedule untouched
        if (attempt.status === "insufficient") {
            res.status(400).json({
                message: `Cannot publish schedule: insufficient vacation balance for ${attempt.insufficientBalances.map(describeShortfall).join(", ")}`,
                code: "INSUFFICIENT_VACATION_BALANCE",
                insufficientBalances: attempt.insufficientBalances,
            });
            return;
        }
        if (attempt.status === "conflict") {
            res.status(409).json(SCHEDULE_CHANGED_RESPONSE);
            return;
        }

        const view = toManagerView(attempt.schedule);
        res.json(attempt.unchanged ? { ...view, unchanged: true } : view);
    } catch (err: unknown) {
        console.error("Error publishing schedule:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function getAllSchedules(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetAllSchedulesRequestQuery;
        const { groupId } = query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        // History and statistics reflect the last successful publish only, for everyone (managers
        // included): drafts and unpublished edits never count, just as they never touch balances.
        const scheduleFilter: AllSchedulesFilterCriteria = { groupId: group._id, isPublished: true };

        const schedulesQuery = ShiftSchedule.find(scheduleFilter).select("-__v -draftShifts");
        const schedules = await (typeof (schedulesQuery as any).lean === "function"
            ? (schedulesQuery as any).lean()
            : schedulesQuery);
        res.json((Array.isArray(schedules) ? schedules : []).map(toPublishedView));
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}
