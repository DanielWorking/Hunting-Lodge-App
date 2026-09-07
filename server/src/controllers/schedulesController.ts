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

        const schedule = await ShiftSchedule.findOne(scheduleFilter);
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

        const oldSchedule = await ShiftSchedule.findOne({
            groupId: group._id,
            startDate,
        });

        if (oldSchedule && oldSchedule.isPublished) {
            const shiftTypes = (group.settings as { shiftTypes?: IShiftType[] })?.shiftTypes || [];
            const vacationTypeIds = shiftTypes
                .filter((t) => Boolean(t.isVacation))
                .map((t) => t._id?.toString() || "");

            if (vacationTypeIds.length > 0) {
                for (const oldShift of oldSchedule.shifts) {
                    if (oldShift.vacationDeducted) {
                        const stillExistsAsVacation = (shifts || []).find(
                            (newShift) =>
                                String(newShift.userId) === String(oldShift.userId) &&
                                new Date(newShift.date).toISOString() === new Date(oldShift.date).toISOString() &&
                                vacationTypeIds.includes(String(newShift.shiftTypeId)),
                        );

                        if (!stillExistsAsVacation) {
                            await User.findByIdAndUpdate(oldShift.userId, {
                                $inc: { vacationBalance: 1 },
                            });
                        }
                    }
                }
            }

            (shifts || []).forEach((newShift) => {
                const matchingOldShift = oldSchedule.shifts.find(
                    (old) =>
                        String(old.userId) === String(newShift.userId) &&
                        new Date(old.date).toISOString() === new Date(newShift.date).toISOString() &&
                        String(old.shiftTypeId) === String(newShift.shiftTypeId),
                );

                if (matchingOldShift && matchingOldShift.vacationDeducted) {
                    newShift.vacationDeducted = true;
                }
            });
        }

        const schedule = await ShiftSchedule.findOneAndUpdate(
            { groupId: group._id, startDate },
            { groupId: group._id, startDate, endDate, shifts },
            { returnDocument: "after", upsert: true },
        );

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

        const deductedUserIds: (Types.ObjectId | string)[] = [];

        if (vacationTypeIds.length > 0) {
            for (let i = 0; i < schedule.shifts.length; i++) {
                const shift = schedule.shifts[i];
                const shiftTypeIdStr = String(shift.shiftTypeId);

                if (vacationTypeIds.includes(shiftTypeIdStr) && !shift.vacationDeducted) {
                    // Atomically decrement only if user has a positive balance to prevent negative balance underflow
                    const updatedUser = await User.findOneAndUpdate(
                        { _id: shift.userId, vacationBalance: { $gt: 0 } },
                        { $inc: { vacationBalance: -1 } },
                        { returnDocument: "after" },
                    );

                    if (updatedUser) {
                        shift.vacationDeducted = true;
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
                        deductedUserIds.push(userIdVal);
                    } else {
                        console.warn(`[PublishSchedule] User ${String(shift.userId)} has 0 vacation balance; balance deduction skipped to prevent underflow.`);
                    }
                }
            }
        }

        try {
            schedule.isPublished = true;
            schedule.markModified("shifts");
            await schedule.save();
        } catch (saveErr: unknown) {
            // Rollback any deducted balances if schedule save fails
            for (const userId of deductedUserIds) {
                await User.findByIdAndUpdate(userId, { $inc: { vacationBalance: 1 } }).catch((rollbackErr: unknown) => {
                    console.error(`[Schedules] Failed to rollback vacation balance for user ${String(userId)}:`, rollbackErr);
                });
            }
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

        const schedules = await ShiftSchedule.find(scheduleFilter);
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
