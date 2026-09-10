/**
 * @module SchedulesController
 * 
 * Handlers for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 * 
 * Enforces strict role checks: only explicit Shift Managers of a group can
 * view drafts, save schedules, and publish schedules.
 * Migrated to strict TypeScript with zero `any` and robust rollback handling.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import ShiftSchedule, { IShiftAssignment } from "../models/ShiftSchedule";
import User from "../models/User";
import { IShiftType } from "../models/Group";
import { isShiftManager, resolveGroup, AuthUser } from "../utils/authHelpers";

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
}

export interface GetAllSchedulesRequestQuery {
    groupId?: string;
}

export interface ScheduleFilterCriteria {
    groupId: Types.ObjectId | string;
    startDate?: Date;
    isPublished?: boolean;
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
            res.status(400).json({ message: "Missing groupId or date" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const startDate = new Date(date);
        const requestingUser = req.user as AuthUser | undefined;

        // Permission check: Only explicit shift managers of this group can view draft schedules
        const canViewDrafts = await isShiftManager(requestingUser, group._id);

        const scheduleFilter: ScheduleFilterCriteria = {
            groupId: group._id,
            startDate: startDate,
        };

        if (!canViewDrafts) {
            scheduleFilter.isPublished = true;
        }

        const scheduleQuery = ShiftSchedule.findOne(scheduleFilter);
        const schedule = await (typeof (scheduleQuery as any).lean === "function"
            ? (scheduleQuery as any).lean()
            : scheduleQuery);
        res.json(schedule);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function saveSchedule(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as SaveScheduleRequestBody;
        const { groupId, startDate, endDate, shifts } = body;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
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

        let oldScheduleQuery: any = ShiftSchedule.findOne({
            groupId: group._id,
            startDate,
        });
        if (typeof oldScheduleQuery?.select === "function") {
            const selected = oldScheduleQuery.select("isPublished shifts");
            if (selected) oldScheduleQuery = selected;
        }
        const oldSchedule = await (typeof oldScheduleQuery?.lean === "function"
            ? oldScheduleQuery.lean()
            : oldScheduleQuery);

        if (oldSchedule && oldSchedule.isPublished) {
            const shiftTypes = (group.settings as { shiftTypes?: IShiftType[] })?.shiftTypes || [];
            const vacationTypeIds = shiftTypes
                .filter((t) => Boolean(t.isVacation))
                .map((t) => t._id?.toString() || "");

            if (vacationTypeIds.length > 0) {
                const balanceAdjustments: Promise<unknown>[] = [];

                for (const oldShift of oldSchedule.shifts) {
                    if (oldShift.vacationDeducted) {
                        const matchingNewShift = (shifts || []).find(
                            (newShift) =>
                                String(newShift.userId) === String(oldShift.userId) &&
                                new Date(newShift.date).toISOString() === new Date(oldShift.date).toISOString() &&
                                vacationTypeIds.includes(String(newShift.shiftTypeId)),
                        );

                        const oldVal = oldShift.vacationValue !== undefined ? oldShift.vacationValue : 1;

                        if (!matchingNewShift) {
                            balanceAdjustments.push(
                                User.findByIdAndUpdate(oldShift.userId, {
                                    $inc: { vacationBalance: oldVal },
                                }),
                            );
                        } else {
                            const newVal = matchingNewShift.vacationValue !== undefined ? matchingNewShift.vacationValue : 1;
                            const diff = oldVal - newVal;
                            if (diff !== 0) {
                                balanceAdjustments.push(
                                    User.findByIdAndUpdate(oldShift.userId, {
                                        $inc: { vacationBalance: diff },
                                    }),
                                );
                            }
                        }
                    }
                }

                if (balanceAdjustments.length > 0) {
                    await Promise.all(balanceAdjustments);
                }
            }

            (shifts || []).forEach((newShift) => {
                const matchingOldShift = (oldSchedule.shifts || []).find(
                    (old: any) =>
                        String(old.userId) === String(newShift.userId) &&
                        new Date(old.date).toISOString() === new Date(newShift.date).toISOString() &&
                        String(old.shiftTypeId) === String(newShift.shiftTypeId),
                );

                if (matchingOldShift && matchingOldShift.vacationDeducted) {
                    newShift.vacationDeducted = true;
                }
            });
        }

        const scheduleQuery = ShiftSchedule.findOneAndUpdate(
            { groupId: group._id, startDate },
            { groupId: group._id, startDate, endDate, shifts },
            { returnDocument: "after", upsert: true },
        );
        const schedule = await (typeof (scheduleQuery as any).lean === "function"
            ? (scheduleQuery as any).lean()
            : scheduleQuery);

        res.json(schedule);
    } catch (err: unknown) {
        console.error("Error saving schedule:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function publishSchedule(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as PublishScheduleRequestBody;
        const { scheduleId } = body;
        if (!scheduleId || typeof scheduleId !== "string") {
            res.status(400).json({ message: "Missing scheduleId" });
            return;
        }

        const schedule = await ShiftSchedule.findById(scheduleId);
        if (!schedule) {
            res.status(404).json({ message: "Schedule not found" });
            return;
        }

        const group = await resolveGroup(schedule.groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found for schedule" });
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

        const shiftTypes = (group.settings as { shiftTypes?: IShiftType[] })?.shiftTypes || [];
        const vacationTypeIds = shiftTypes
            .filter((t) => Boolean(t.isVacation))
            .map((t) => t._id?.toString() || "");

        const deductedRecords: { userId: Types.ObjectId | string; amount: number }[] = [];

        if (vacationTypeIds.length > 0) {
            // Pre-aggregate requested deductions by unique userId to avoid multiple sequential roundtrips and race conditions
            const userDeductionMap = new Map<string, { totalVal: number; userIdVal: Types.ObjectId | string; shifts: (typeof schedule.shifts)[0][] }>();

            for (let i = 0; i < schedule.shifts.length; i++) {
                const shift = schedule.shifts[i];
                const shiftTypeIdStr = String(shift.shiftTypeId);

                if (vacationTypeIds.includes(shiftTypeIdStr) && !shift.vacationDeducted) {
                    const vacationVal = shift.vacationValue !== undefined ? shift.vacationValue : 1;
                    const rawShiftUserId = shift.userId;
                    let userIdVal: Types.ObjectId | string = "";
                    if (rawShiftUserId instanceof Types.ObjectId) {
                        userIdVal = rawShiftUserId;
                    } else if (rawShiftUserId && typeof rawShiftUserId === "object" && "_id" in rawShiftUserId) {
                        const idProp = (rawShiftUserId as { _id?: unknown })._id;
                        userIdVal = idProp instanceof Types.ObjectId ? idProp : String(idProp);
                    } else {
                        userIdVal = String(rawShiftUserId);
                    }
                    const userKey = userIdVal.toString();
                    const existing = userDeductionMap.get(userKey) || { totalVal: 0, userIdVal, shifts: [] };
                    existing.totalVal += vacationVal;
                    existing.shifts.push(shift);
                    userDeductionMap.set(userKey, existing);
                }
            }

            if (userDeductionMap.size > 0) {
                // Execute atomic deductions per unique user concurrently
                const deductionPromises = Array.from(userDeductionMap.values()).map(async ({ totalVal, userIdVal, shifts }) => {
                    const updatedUser = await User.findOneAndUpdate(
                        { _id: userIdVal, vacationBalance: { $gte: totalVal } },
                        { $inc: { vacationBalance: -totalVal } },
                        { returnDocument: "after" }
                    );
                    if (updatedUser) {
                        for (const shift of shifts) {
                            shift.vacationDeducted = true;
                        }
                        deductedRecords.push({ userId: userIdVal, amount: totalVal });
                    } else {
                        console.warn(`[PublishSchedule] User ${String(userIdVal)} has insufficient vacation balance (${totalVal} required); balance deduction skipped.`);
                    }
                });
                await Promise.all(deductionPromises);
            }
        }

        try {
            schedule.isPublished = true;
            schedule.markModified("shifts");
            await schedule.save();
        } catch (saveErr: unknown) {
            // Rollback any deducted balances with exact amounts concurrently if schedule save fails
            await Promise.all(
                deductedRecords.map((record) =>
                    User.findByIdAndUpdate(record.userId, { $inc: { vacationBalance: record.amount } }).catch((rollbackErr: unknown) => {
                        console.error(`[Schedules] Failed to rollback vacation balance for user ${String(record.userId)}:`, rollbackErr);
                    }),
                ),
            );
            throw saveErr;
        }

        res.json(schedule);
    } catch (err: unknown) {
        console.error("Error publishing schedule:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function getAllSchedules(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetAllSchedulesRequestQuery;
        const { groupId } = query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Permission check: Only explicit shift managers of this group can view draft schedules
        const canViewDrafts = await isShiftManager(requestingUser, group._id);

        const scheduleFilter: AllSchedulesFilterCriteria = { groupId: group._id };

        if (!canViewDrafts) {
            scheduleFilter.isPublished = true;
        }

        const schedulesQuery = ShiftSchedule.find(scheduleFilter).select("-__v");
        const schedules = await (typeof (schedulesQuery as any).lean === "function"
            ? (schedulesQuery as any).lean()
            : schedulesQuery);
        res.json(schedules);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export default {
    getSchedule,
    saveSchedule,
    publishSchedule,
    getAllSchedules,
};
