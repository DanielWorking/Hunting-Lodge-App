/**
 * @module ReportsController
 * 
 * Handlers for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 * 
 * Enforces strict group boundaries:
 * - Only explicit group members (including the group's Shift Manager) can view, create, and update reports.
 * - Only explicit Shift Managers of the group can delete reports.
 * Reports cannot be locked: any group member may edit any report of the group.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import ShiftReport, { IShiftReportAttendee } from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import { ITimeSlot } from "../models/Group";
import { resolveGroup, isGroupMember, isShiftManager, AuthUser } from "../utils/authHelpers";
import { loadAutomaticAttendees, matchTimeSlot, scheduledUserIds } from "../services/reportAttendees";

export interface GetReportsRequestQuery {
    groupId?: string;
    year?: string;
    month?: string;
    day?: string;
    limit?: string | number;
    cursorDate?: string;
    cursorId?: string;
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
    previousTasks?: string;
    [key: string]: unknown;
}

export interface ReportFilterCriteria {
    groupId: Types.ObjectId | string;
    date?: {
        $gte?: Date;
        $lte?: Date;
    };
    $or?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

export async function getReports(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetReportsRequestQuery;
        const { groupId, year, month, day } = query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId", code: "VALIDATION_ERROR" });
            return;
        }

        // Resolve first so a missing group answers 404 rather than a misleading 403
        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;
        const hasAccess = await isGroupMember(requestingUser, group);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
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

        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

        if (req.query.cursorDate && req.query.cursorId) {
            const rawCursorDate = String(req.query.cursorDate);
            const rawCursorId = String(req.query.cursorId);
            const parsedDate = new Date(rawCursorDate);

            // Guard against malformed cursor parameters
            if (!isNaN(parsedDate.getTime()) && Types.ObjectId.isValid(rawCursorId)) {
                const pId = new Types.ObjectId(rawCursorId);
                reportFilter.$or = [
                    { date: { $lt: parsedDate } },
                    { date: parsedDate, _id: { $lt: pId } },
                ];
            }
        }

        let reportQuery: any = ShiftReport.find(reportFilter);
        if (typeof reportQuery.sort === "function") {
            const sorted = reportQuery.sort({ date: -1, _id: -1 });
            if (sorted) reportQuery = sorted;
        }
        if (typeof reportQuery.limit === "function") {
            const limited = reportQuery.limit(limit + 1);
            if (limited) reportQuery = limited;
        }

        const rawReports = await (typeof reportQuery.lean === "function"
            ? reportQuery.lean()
            : reportQuery);

        const hasMore = Array.isArray(rawReports) && rawReports.length > limit;
        const reports = hasMore ? rawReports.slice(0, limit) : rawReports;

        res.setHeader("X-Has-More", hasMore ? "true" : "false");
        if (hasMore && Array.isArray(reports) && reports.length > 0) {
            const lastItem = reports[reports.length - 1];
            const lastDate = lastItem.date instanceof Date ? lastItem.date.toISOString() : String(lastItem.date);
            const lastId = lastItem._id ? lastItem._id.toString() : "";
            res.setHeader("X-Next-Cursor-Date", lastDate);
            res.setHeader("X-Next-Cursor-Id", lastId);
        }

        res.json(reports);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export async function createReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as CreateReportRequestBody;
        const { groupId, title, startTime, endTime } = body;

        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Target groupId is required", code: "VALIDATION_ERROR" });
            return;
        }

        // Resolve first so a missing group answers 404 rather than a misleading 403
        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;
        const hasAccess = await isGroupMember(requestingUser, group);
        if (!hasAccess) {
            res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
            return;
        }

        let attendees: IShiftReportAttendee[] = [];
        const reportStart = new Date(typeof startTime === "string" ? startTime : Date.now());

        // Inherit tasks and schedule attendees concurrently
        const [lastReport, schedule] = await Promise.all([
            (async () => {
                let lastReportQuery: any = ShiftReport.findOne({
                    groupId: group._id,
                    date: { $lte: reportStart },
                });
                if (typeof lastReportQuery.sort === "function") {
                    const sorted = lastReportQuery.sort({ date: -1, startTime: -1 });
                    if (sorted) lastReportQuery = sorted;
                }
                if (typeof lastReportQuery.select === "function") {
                    const selected = lastReportQuery.select("currentTasks");
                    if (selected) lastReportQuery = selected;
                }
                return (typeof lastReportQuery.lean === "function" ? lastReportQuery.lean() : lastReportQuery);
            })(),
            (async () => {
                let schedQuery: any = ShiftSchedule.findOne({
                    groupId: group._id,
                    isPublished: true,
                    startDate: { $lte: reportStart },
                    endDate: { $gte: reportStart },
                });
                if (typeof schedQuery.select === "function") {
                    const selected = schedQuery.select("shifts");
                    if (selected) schedQuery = selected;
                }
                return (typeof schedQuery.lean === "function" ? schedQuery.lean() : schedQuery);
            })(),
        ]);

        const previousTasks = lastReport ? lastReport.currentTasks || "" : "";

        const timeSlots = (group.settings as { timeSlots?: ITimeSlot[] })?.timeSlots;
        if (schedule && Array.isArray(timeSlots)) {
            // Slot and day are matched on Jerusalem time, exactly as the cron and the publish re-sync do
            const userIds = scheduledUserIds(schedule.shifts, matchTimeSlot(timeSlots, reportStart), reportStart);
            attendees = await loadAutomaticAttendees(group._id, userIds);
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
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function updateReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        let reportQuery: any = ShiftReport.findById(reportId);
        if (typeof reportQuery?.select === "function") {
            const selected = reportQuery.select("groupId");
            if (selected) reportQuery = selected;
        }
        const report = await (typeof reportQuery?.lean === "function"
            ? reportQuery.lean()
            : reportQuery);
        if (!report) {
            res.status(404).json({ message: "Report not found", code: "NOT_FOUND" });
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

        // Only these fields are writable; anything else in the body is ignored
        const body = (req.body || {}) as UpdateReportRequestBody;
        const { currentTasks, attendees, previousTasks } = body;
        const updateData: Record<string, unknown> = {};
        if (currentTasks !== undefined) updateData.currentTasks = currentTasks;
        if (attendees !== undefined) updateData.attendees = attendees;
        if (previousTasks !== undefined) updateData.previousTasks = previousTasks;

        const updatedReportQuery = ShiftReport.findByIdAndUpdate(
            reportId,
            { $set: updateData },
            { returnDocument: "after", runValidators: true },
        );
        const updatedReport = await (typeof (updatedReportQuery as any).lean === "function"
            ? (updatedReportQuery as any).lean()
            : updatedReportQuery);

        res.json(updatedReport);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(400).json({ message: err instanceof Error ? err.message : String(err), code: "BAD_REQUEST" });
    }
}

export async function deleteReport(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const reportId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        let reportQuery: any = ShiftReport.findById(reportId);
        if (typeof reportQuery?.select === "function") {
            const selected = reportQuery.select("groupId");
            if (selected) reportQuery = selected;
        }
        const report = await (typeof reportQuery?.lean === "function"
            ? reportQuery.lean()
            : reportQuery);
        if (!report) {
            res.status(404).json({ message: "Report not found", code: "NOT_FOUND" });
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}
