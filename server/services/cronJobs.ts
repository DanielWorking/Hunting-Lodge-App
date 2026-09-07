/**
 * @module cronJobs
 *
 * This module handles automated background tasks for the application using node-cron.
 * Its primary responsibility is to automatically generate shift reports for all groups
 * based on their defined time slots and active schedules.
 */

import cron, { ScheduledTask, TaskOptions } from "node-cron";
import mongoose, { Types } from "mongoose";
import Group from "../models/Group";
import ShiftReport from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import User from "../models/User";

/**
 * Represents a single time slot configured on a group.
 */
export interface ITimeSlot {
    readonly _id?: Types.ObjectId | string;
    readonly name: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly linkedShiftTypes?: ReadonlyArray<Types.ObjectId | string>;
}

/**
 * Represents a shift type configured on a group (e.g., Morning, Night).
 */
export interface IShiftType {
    readonly _id?: Types.ObjectId | string;
    readonly name: string;
    readonly color?: string;
    readonly isVacation?: boolean;
}

/**
 * Group settings containing shift types and time slots.
 */
export interface IGroupSettings {
    readonly shiftTypes?: ReadonlyArray<IShiftType>;
    readonly timeSlots?: ReadonlyArray<ITimeSlot>;
}

/**
 * Minimal interface for a Group document returned from database queries.
 */
export interface IGroup {
    readonly _id: Types.ObjectId | string;
    readonly name: string;
    readonly members?: ReadonlyArray<Types.ObjectId | string>;
    readonly settings?: IGroupSettings;
    readonly siteTags?: ReadonlyArray<string>;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}

/**
 * Represents an attendee attached to a ShiftReport.
 */
export interface IShiftAttendee {
    readonly userId?: Types.ObjectId | string;
    readonly name?: string;
    readonly isManual: boolean;
}

/**
 * Structure of a shift assignment inside a ShiftSchedule.
 */
export interface IScheduleShift {
    readonly userId: Types.ObjectId | string;
    readonly date: Date | string;
    readonly shiftTypeId: Types.ObjectId | string;
    readonly vacationDeducted?: boolean;
}

/**
 * ShiftSchedule document structure.
 */
export interface IShiftSchedule {
    readonly _id?: Types.ObjectId | string;
    readonly groupId: Types.ObjectId | string;
    readonly startDate: Date | string;
    readonly endDate: Date | string;
    readonly isPublished: boolean;
    readonly shifts?: ReadonlyArray<IScheduleShift>;
}

/**
 * ShiftReport document structure.
 */
export interface IShiftReport {
    readonly _id?: Types.ObjectId | string;
    readonly groupId: Types.ObjectId | string;
    readonly title: string;
    readonly date: Date;
    readonly startTime: string;
    readonly endTime: string;
    readonly previousTasks?: string;
    readonly currentTasks?: string;
    readonly attendees?: ReadonlyArray<IShiftAttendee>;
    readonly isLocked?: boolean;
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}

/**
 * Minimal User document structure for attendees lookup.
 */
export interface IUser {
    readonly _id: Types.ObjectId | string;
    readonly username: string;
    readonly displayName?: string;
    readonly email?: string;
    readonly isActive?: boolean;
}

/**
 * Time components in Asia/Jerusalem timezone.
 */
export interface JerusalemTime {
    readonly hour: number;
    readonly minute: number;
}

// Atomic concurrency guard to prevent overlapping cron job executions
let isJobRunning = false;

/**
 * Extracts the current hour and minute in Asia/Jerusalem timezone.
 *
 * @param date - The reference date (defaults to current timestamp).
 * @returns An object containing the 24-hour hour and minute in Jerusalem time.
 */
export function getTimeInJerusalem(date: Date = new Date()): JerusalemTime {
    try {
        const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jerusalem",
            hour: "numeric",
            minute: "numeric",
            hourCycle: "h23",
        });
        const parts = formatter.formatToParts(validDate);
        const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
        const minStr = parts.find((p) => p.type === "minute")?.value ?? "0";
        const rawHour = parseInt(hourStr, 10);
        const rawMin = parseInt(minStr, 10);
        const hour = isNaN(rawHour) ? 0 : rawHour % 24;
        const minute = isNaN(rawMin) ? 0 : rawMin % 60;
        return { hour, minute };
    } catch {
        const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const hour = Number.isFinite(safeDate.getHours()) ? safeDate.getHours() % 24 : 0;
        const minute = Number.isFinite(safeDate.getMinutes()) ? safeDate.getMinutes() % 60 : 0;
        return { hour, minute };
    }
}

/**
 * Formats a Date into DD/MM/YYYY string in Asia/Jerusalem timezone.
 * Strips any Unicode directional markers to ensure clean ASCII date matching.
 *
 * @param date - The date to format (defaults to current timestamp).
 * @returns The formatted date string in DD/MM/YYYY format.
 */
export function getJerusalemDateString(date: Date = new Date()): string {
    const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    return validDate
        .toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Jerusalem",
        })
        .replace(/[\u200E\u200F]/g, "")
        .replace(/\./g, "/");
}

/**
 * Helper to safely extract part values from Intl.DateTimeFormatPart array.
 */
function getPartValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : "0";
}

/**
 * Calculates a Date representing the given HH:mm time on the reference date in Asia/Jerusalem timezone.
 * Handles daylight saving transitions (DST) across midnight and clock change boundaries.
 *
 * @param refDate - The reference date.
 * @param timeStr - Time string formatted as "HH:mm".
 * @returns Date object in UTC corresponding to the specified Jerusalem local time.
 */
export function getJerusalemDate(refDate: Date, timeStr: string): Date {
    const validRef = refDate instanceof Date && !isNaN(refDate.getTime()) ? refDate : new Date();
    const timeParts = (timeStr ?? "").split(":");
    const h = parseInt(timeParts[0] ?? "0", 10);
    const m = parseInt(timeParts[1] ?? "0", 10);
    const safeH = isNaN(h) ? 0 : Math.min(Math.max(h, 0), 23);
    const safeM = isNaN(m) ? 0 : Math.min(Math.max(m, 0), 59);

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(validRef);

    const year = parseInt(getPartValue(parts, "year"), 10);
    const month = parseInt(getPartValue(parts, "month"), 10);
    const day = parseInt(getPartValue(parts, "day"), 10);

    const approx = new Date(Date.UTC(year, month - 1, day, safeH, safeM));
    const jParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(approx);

    const rawJHour = parseInt(getPartValue(jParts, "hour"), 10);
    const jHour = rawJHour === 24 ? 0 : rawJHour;
    const jMin = parseInt(getPartValue(jParts, "minute"), 10);

    const jAsUtc = Date.UTC(
        parseInt(getPartValue(jParts, "year"), 10),
        parseInt(getPartValue(jParts, "month"), 10) - 1,
        parseInt(getPartValue(jParts, "day"), 10),
        jHour,
        jMin
    );
    const offsetMs = jAsUtc - approx.getTime();
    let target = new Date(approx.getTime() - offsetMs);

    // DST boundary correction: verify target local time in Jerusalem matches desired time
    const verifyParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(target);

    const rawVerifyHour = parseInt(getPartValue(verifyParts, "hour"), 10);
    const verifyHour = rawVerifyHour === 24 ? 0 : rawVerifyHour;
    const verifyMin = parseInt(getPartValue(verifyParts, "minute"), 10);
    const verifyUtc = Date.UTC(
        parseInt(getPartValue(verifyParts, "year"), 10),
        parseInt(getPartValue(verifyParts, "month"), 10) - 1,
        parseInt(getPartValue(verifyParts, "day"), 10),
        verifyHour,
        verifyMin
    );
    const desiredUtc = Date.UTC(year, month - 1, day, safeH, safeM);
    const discrepancyMs = desiredUtc - verifyUtc;
    if (discrepancyMs !== 0) {
        target = new Date(target.getTime() + discrepancyMs);
    }

    return target;
}

/**
 * Processes a single time slot for a group, creating a ShiftReport if within trigger window and not already existing.
 *
 * @param group - The group document or lean representation.
 * @param slot - The time slot configuration.
 * @param now - The current execution timestamp.
 * @param currentJerusalemMinutes - Total minutes elapsed today in Jerusalem time.
 */
export async function processGroupSlot(
    group: IGroup,
    slot: ITimeSlot,
    now: Date,
    currentJerusalemMinutes: number
): Promise<void> {
    if (
        !group ||
        !group._id ||
        !slot ||
        typeof slot.startTime !== "string" ||
        typeof slot.endTime !== "string"
    ) {
        return;
    }

    const [slotHourStr, slotMinuteStr] = slot.startTime.split(":");
    const slotHour = parseInt(slotHourStr ?? "", 10);
    const slotMinute = parseInt(slotMinuteStr ?? "", 10);
    if (isNaN(slotHour) || isNaN(slotMinute)) {
        return;
    }

    const slotTimeVal = slotHour * 60 + slotMinute;

    // Asymmetric tolerance window:
    // Allows from 1 minute before up to 5 minutes after slot start.
    // This allows recovery if Node.js event-loop lag delays cron execution by several minutes.
    const diff = currentJerusalemMinutes - slotTimeVal;
    if (diff < -1 || diff > 5) {
        return;
    }

    const formattedDate = getJerusalemDateString(now);
    const slotName = slot.name || "Shift";
    const reportTitle = `${slotName} - ${formattedDate}`;

    // Ensure idempotency: check if a report for this slot/group already exists for today.
    const existingReport = (await ShiftReport.findOne({
        groupId: group._id,
        title: reportTitle,
    }).lean()) as IShiftReport | null;

    if (existingReport) {
        return;
    }

    const groupDisplayName = group.name || String(group._id);
    console.log(`[Cron] Creating auto-report for group: ${groupDisplayName}, shift: ${slotName}`);

    // Compute timezone-correct shift start and end times
    const shiftStart = getJerusalemDate(now, slot.startTime);
    const shiftEnd = getJerusalemDate(now, slot.endTime);

    // Adjust end date immutably if the shift spans across midnight
    const adjustedShiftEnd = shiftEnd < shiftStart
        ? new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000)
        : shiftEnd;

    // Parallelize previous report and published schedule lookups with lean()
    const [lastReport, schedule] = await Promise.all([
        ShiftReport.findOne({ groupId: group._id })
            .sort({ startTime: -1 })
            .lean() as Promise<IShiftReport | null>,
        ShiftSchedule.findOne({
            groupId: group._id,
            isPublished: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean() as Promise<IShiftSchedule | null>,
    ]);

    const previousTasks: string =
        lastReport && typeof lastReport.currentTasks === "string" ? lastReport.currentTasks : "";
    let attendees: IShiftAttendee[] = [];

    if (schedule && Array.isArray(schedule.shifts)) {
        const relevantShiftTypeIds = (slot.linkedShiftTypes ?? []).map(String);
        const nowJerusalemDate = getJerusalemDateString(now);

        // Filter shifts from the schedule that match today's date in Jerusalem and the slot's shift types.
        const shiftsToday = schedule.shifts.filter((s: IScheduleShift): boolean => {
            if (!s || !s.date) return false;
            const shiftJerusalemDate = getJerusalemDateString(new Date(s.date));
            const isSameDate = shiftJerusalemDate === nowJerusalemDate;
            const isRelevantType =
                relevantShiftTypeIds.length === 0 ||
                (s.shiftTypeId !== undefined && relevantShiftTypeIds.includes(String(s.shiftTypeId)));
            return isSameDate && isRelevantType;
        });

        const userIds = shiftsToday.map((s: IScheduleShift) => s.userId).filter(Boolean);
        if (userIds.length > 0) {
            const users = (await User.find({ _id: { $in: userIds } }).lean()) as IUser[];
            attendees = users.map((u: IUser): IShiftAttendee => ({
                userId: u._id,
                name: u.username,
                isManual: false,
            }));
        }
    }

    // Initialize and save the new automated ShiftReport
    try {
        const newReport = new ShiftReport({
            groupId: group._id,
            title: reportTitle,
            date: now,
            startTime: shiftStart.toISOString(),
            endTime: adjustedShiftEnd.toISOString(),
            previousTasks,
            attendees,
            currentTasks: "",
            isLocked: false,
        });

        await newReport.save();
        console.log(`[Cron] Successfully saved new report for ${groupDisplayName}`);
    } catch (saveError: unknown) {
        // Handle race conditions where another worker or process inserted the same report
        const isDuplicateKey =
            typeof saveError === "object" &&
            saveError !== null &&
            (("code" in saveError && (saveError as { code: unknown }).code === 11000) ||
                ("errorResponse" in saveError &&
                    typeof (saveError as { errorResponse: unknown }).errorResponse === "object" &&
                    (saveError as { errorResponse: { code?: unknown } }).errorResponse?.code === 11000));

        if (isDuplicateKey) {
            console.warn(`[Cron] Report already exists (duplicate key) for ${groupDisplayName} - ${slotName}`);
        } else {
            const errorStack =
                saveError instanceof Error ? saveError.stack ?? saveError.message : String(saveError);
            console.error(`[Cron] Error saving report for ${groupDisplayName}:`, errorStack);
        }
    }
}

/**
 * Main worker routine that queries groups and generates shift reports.
 *
 * @param now - Execution timestamp (defaults to current time).
 */
export async function runShiftReportGenerator(now: Date = new Date()): Promise<void> {
    if (isJobRunning) {
        console.warn("[Cron] Previous shift report cycle is still running. Skipping cycle to prevent queue build-up.");
        return;
    }

    // Guard against running queries if MongoDB is not connected (readyState 1)
    if (mongoose.connection.readyState !== 1) {
        console.warn(`[Cron] MongoDB not connected (readyState: ${mongoose.connection.readyState}). Skipping cycle.`);
        return;
    }

    isJobRunning = true;
    try {
        const jTime = getTimeInJerusalem(now);
        const currentJerusalemMinutes = jTime.hour * 60 + jTime.minute;

        const groups = (await Group.find({}).lean()) as IGroup[];
        if (!Array.isArray(groups)) {
            return;
        }

        await Promise.allSettled(
            groups.map(async (group: IGroup): Promise<void> => {
                try {
                    const settings = group?.settings;
                    const timeSlots = settings?.timeSlots;
                    if (!timeSlots || !Array.isArray(timeSlots)) {
                        return;
                    }

                    for (const slot of timeSlots) {
                        try {
                            await processGroupSlot(group, slot, now, currentJerusalemMinutes);
                        } catch (slotError: unknown) {
                            const errorStack =
                                slotError instanceof Error ? slotError.stack ?? slotError.message : String(slotError);
                            console.error(
                                `[Cron] Error processing slot "${slot?.name}" for group "${group?.name || String(group?._id)}":`,
                                errorStack
                            );
                        }
                    }
                } catch (groupError: unknown) {
                    const errorStack =
                        groupError instanceof Error ? groupError.stack ?? groupError.message : String(groupError);
                    console.error(
                        `[Cron] Error processing group "${group?.name || String(group?._id)}":`,
                        errorStack
                    );
                }
            })
        );
    } catch (error: unknown) {
        const errorStack = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error("[Cron] Error generating shift reports:", errorStack);
    } finally {
        isJobRunning = false;
    }
}

/**
 * Cron expression for shift report generation.
 * Can be overridden via SHIFT_REPORT_CRON_SCHEDULE env var.
 * Defaults to every minute ("* * * * *").
 */
const DEFAULT_CRON_SCHEDULE = "* * * * *";

function getCronScheduleExpression(): string {
    const envSchedule = process.env.SHIFT_REPORT_CRON_SCHEDULE;
    if (!envSchedule) {
        return DEFAULT_CRON_SCHEDULE;
    }
    if (cron.validate(envSchedule)) {
        return envSchedule;
    }
    console.warn(
        `[Cron] Invalid SHIFT_REPORT_CRON_SCHEDULE "${envSchedule}". Falling back to default "${DEFAULT_CRON_SCHEDULE}".`
    );
    return DEFAULT_CRON_SCHEDULE;
}

const cronScheduleExpression: string = getCronScheduleExpression();

/**
 * Task options for node-cron scheduler.
 */
const cronTaskOptions: TaskOptions = {
    name: "shift-report-generator",
    timezone: "Asia/Jerusalem",
    noOverlap: true,
};

/**
 * Scheduled job that runs every minute to check for upcoming shift starts.
 * Wrapped with strict error boundary to prevent unhandled rejections or crashes.
 */
export const job: ScheduledTask = cron.schedule(
    cronScheduleExpression,
    async (): Promise<void> => {
        try {
            await runShiftReportGenerator();
        } catch (err: unknown) {
            const errorStack = err instanceof Error ? err.stack ?? err.message : String(err);
            console.error("[Cron] Unhandled error in scheduled task callback:", errorStack);
        }
    },
    cronTaskOptions
);

/**
 * Gracefully stops the cron scheduler.
 */
export const stopCronJobs = (): void => {
    if (job && typeof job.stop === "function") {
        job.stop();
    }
};

export default {
    job,
    runShiftReportGenerator,
    stopCronJobs,
    getTimeInJerusalem,
    getJerusalemDateString,
    getJerusalemDate,
    processGroupSlot,
};
