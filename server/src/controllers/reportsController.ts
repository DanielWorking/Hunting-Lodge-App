/**
 * @module ReportsController
 * 
 * Handlers for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 * 
 * Enforces strict group boundaries:
 * - Only explicit group members can view, create, and update reports.
 * - Only explicit Shift Managers of the group can delete reports.
 * Migrated to strict TypeScript with zero `any` and strict lock invariant checks.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import ShiftReport, { IShiftReportAttendee } from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import { ITimeSlot } from "../models/Group";
import User from "../models/User";
import { resolveGroup, isGroupMember, isShiftManager, isAdmin, AuthUser } from "../utils/authHelpers";

export interface GetReportsRequestQuery {
    groupId?: string;
    year?: string;
    month?: string;
    day?: string;
}

export interface CreateReportRequestBody {
    groupId?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
    currentTasks?: string;
    [key: string]: unknown;
}

export interface UpdateReportRequestBody {
    currentTasks?: string;
    attendees?: IShiftReportAttendee[];
    isLocked?: boolean;
    previousTasks?: string;
    [key: string]: unknown;
}

export interface ReportFilterCriteria {
    groupId: Types.ObjectId | string;
    date?: {
        $gte: Date;
        $lte: Date;
    };
}

export async function getReports(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetReportsRequestQuery;
        const { groupId, year, month, day } = query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;
        const hasAccess = await isGroupMember(requestingUser, groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const reportFilter: ReportFilterCriteria = { groupId: group._id };

        // Handle temporal filtering logic on the BSON Date 'date' field
        if (year && typeof year === "string") {
            const parsedYear = Number(year);
            const parsedMonth = typeof month === "string" ? Number(month) : undefined;
            const parsedDay = typeof day === "string" ? Number(day) : undefined;

            const startDate = new Date(parsedYear, parsedMonth !== undefined ? parsedMonth - 1 : 0, parsedDay !== undefined ? parsedDay : 1);
            const endDate = new Date(parsedYear, parsedMonth !== undefined ? parsedMonth : 12, 0, 23, 59, 59);

            if (parsedDay !== undefined) {
                endDate.setMonth(startDate.getMonth());
                endDate.setDate(startDate.getDate());
                endDate.setHours(23, 59, 59);
            }

            reportFilter.date = { $gte: startDate, $lte: endDate };
        }

        const reports = await ShiftReport.find(reportFilter).sort({ date: -1, startTime: -1 });
        res.json(reports);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function createReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as CreateReportRequestBody;
        const { groupId, title, startTime, endTime } = body;

        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Target groupId is required" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;
        const hasAccess = await isGroupMember(requestingUser, groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        let attendees: IShiftReportAttendee[] = [];
        const reportStart = new Date(typeof startTime === "string" ? startTime : Date.now());

        // Inherit tasks from the most recent report of the same group prior to this shift
        const lastReport = await ShiftReport.findOne({
            groupId: group._id,
            date: { $lte: reportStart },
        }).sort({ date: -1, startTime: -1 });
        const previousTasks = lastReport ? lastReport.currentTasks || "" : "";

        // Attempt to pull attendees automatically from the published schedule
        const schedule = await ShiftSchedule.findOne({
            groupId: group._id,
            isPublished: true,
            startDate: { $lte: reportStart },
            endDate: { $gte: reportStart },
        });

        const timeSlots = (group.settings as { timeSlots?: ITimeSlot[] })?.timeSlots;
        if (schedule && Array.isArray(timeSlots)) {
            const reportStartHour = reportStart.getHours();
            const reportStartMinute = reportStart.getMinutes();
            const reportTimeVal = reportStartHour * 60 + reportStartMinute;

            // Match report start time with defined time slots in group settings
            const matchingSlot = timeSlots.find((slot) => {
                if (!slot.startTime || typeof slot.startTime !== "string") return false;
                const [h, m] = slot.startTime.split(":").map(Number);
                const slotTimeVal = h * 60 + m;
                return Math.abs(slotTimeVal - reportTimeVal) < 5;
            });

            const relevantShiftTypeIds = matchingSlot
                ? (matchingSlot.linkedShiftTypes || []).map((id) => id.toString())
                : null;

            // Filter shifts that match the date and optionally the shift type
            const shiftsToday = schedule.shifts.filter((s) => {
                const isSameDate = new Date(s.date).toDateString() === reportStart.toDateString();
                const isRelevantType = relevantShiftTypeIds
                    ? relevantShiftTypeIds.includes(s.shiftTypeId.toString())
                    : true;
                return isSameDate && isRelevantType;
            });

            const userIds = shiftsToday.map((s) => s.userId);
            const users = await User.find({ _id: { $in: userIds } });

            attendees = users.map((u) => ({
                userId: u._id,
                name: u.username,
                isManual: false,
            }));
        }

        const newReport = new ShiftReport({
            groupId: group._id,
            title: typeof title === "string" ? title.trim() : "",
            date: reportStart,
            startTime: typeof startTime === "string" ? startTime : "",
            endTime: typeof endTime === "string" ? endTime : "",
            previousTasks,
            attendees,
            currentTasks: typeof body.currentTasks === "string" ? body.currentTasks : "",
        });

        const savedReport = await newReport.save();
        res.status(201).json(savedReport);
    } catch (err: unknown) {
        console.error(err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function updateReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const report = await ShiftReport.findById(reportId);
        if (!report) {
            res.status(404).json({ message: "Report not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: User must be an explicit member of the report's group
        const hasAccess = await isGroupMember(requestingUser, report.groupId);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this report's group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        // Lock invariant check: If report is locked, reject edits for non-administrators
        if (report.isLocked && !isAdmin(requestingUser)) {
            res.status(400).json({
                message: "This shift report is locked and cannot be edited.",
                code: "REPORT_LOCKED",
            });
            return;
        }

        const body = (req.body || {}) as UpdateReportRequestBody;
        const { currentTasks, attendees, isLocked, previousTasks } = body;
        const updateData: Record<string, unknown> = {};
        if (currentTasks !== undefined) updateData.currentTasks = currentTasks;
        if (attendees !== undefined) updateData.attendees = attendees;
        if (isLocked !== undefined) updateData.isLocked = isLocked;
        if (previousTasks !== undefined) updateData.previousTasks = previousTasks;

        const updatedReport = await ShiftReport.findByIdAndUpdate(
            reportId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true },
        );

        res.json(updatedReport);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export async function deleteReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        const report = await ShiftReport.findById(reportId);
        if (!report) {
            res.status(404).json({ message: "Report not found" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;

        // Authorization: Strictly Shift Manager of this group
        const isMgr = await isShiftManager(requestingUser, report.groupId);
        if (!isMgr) {
            res.status(403).json({
                message: "Forbidden: Only an explicit Shift Manager of this group can delete reports.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
            return;
        }

        await ShiftReport.findByIdAndDelete(reportId);
        res.json({ message: "Report deleted" });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export default {
    getReports,
    createReport,
    updateReport,
    deleteReport,
};
