/**
 * @module cronJobs
 *
 * This module handles automated background tasks for the application using node-cron.
 * Its primary responsibility is to automatically generate shift reports for all groups
 * based on their defined time slots and active schedules.
 */

import cron, { ScheduledTask, TaskOptions } from "node-cron";
import mongoose, { Types } from "mongoose";
import config from "../config";
import Group from "../models/Group";
import ShiftReport from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import { loadAutomaticAttendees, scheduledUserIds } from "./reportAttendees";
import { getTimeInJerusalem, getJerusalemDateString, getJerusalemDate } from "../utils/jerusalemTime";

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
    readonly createdAt?: Date;
    readonly updatedAt?: Date;
}

// Atomic concurrency guard to prevent overlapping cron job executions
let isJobRunning = false;

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
        ShiftReport.findOne({
            groupId: group._id,
            date: { $lte: now },
        })
            .sort({ date: -1, startTime: -1 })
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
        // Same rule as manual reports and the re-sync after a publish (services/reportAttendees)
        const userIds = scheduledUserIds(schedule.shifts, slot, shiftStart);
        attendees = (await loadAutomaticAttendees(group._id, userIds)).map((a): IShiftAttendee => ({
            userId: a.userId as Types.ObjectId,
            name: a.name,
            isManual: false,
        }));
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
        });

        await newReport.save();
        console.log(`[Cron] Successfully saved new report for ${groupDisplayName}`);
    } catch (saveError: unknown) {
        // Handle race conditions where another worker or process inserted the same report
        const errObj =
            typeof saveError === "object" && saveError !== null
                ? (saveError as Record<string, unknown>)
                : null;
        const errResponse =
            errObj && typeof errObj.errorResponse === "object" && errObj.errorResponse !== null
                ? (errObj.errorResponse as Record<string, unknown>)
                : null;
        const errMsg =
            saveError instanceof Error
                ? saveError.message
                : typeof errObj?.message === "string"
                ? errObj.message
                : "";

        const isDuplicateKey = Boolean(
            errObj?.code === 11000 ||
            errObj?.codeName === "DuplicateKey" ||
            errResponse?.code === 11000 ||
            errResponse?.codeName === "DuplicateKey" ||
            errMsg.includes("E11000")
        );

        if (isDuplicateKey) {
            console.warn(
                `[Cron] Report already exists (duplicate key dropped safely) for ${groupDisplayName} - ${slotName}`
            );
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
        throw error;
    } finally {
        isJobRunning = false;
    }
}

/**
 * Task options for node-cron scheduler.
 */
const cronTaskOptions: TaskOptions = {
    name: "shift-report-generator",
    timezone: "Asia/Jerusalem",
    noOverlap: true,
};

let scheduledTask: ScheduledTask | null = null;

/**
 * Starts the in-process shift report scheduler on `config.cron.shiftReportSchedule`.
 * Used in nonprod local development when `ENABLE_IN_PROCESS_CRON=true`.
 */
export const startCronJobs = (): ScheduledTask | null => {
    if (scheduledTask) {
        return scheduledTask;
    }
    const schedule = config.cron.shiftReportSchedule;
    if (!schedule) {
        return null;
    }
    scheduledTask = cron.schedule(
        schedule,
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
    return scheduledTask;
};

/**
 * Gracefully stops the cron scheduler if it was started.
 */
export const stopCronJobs = (): void => {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
};
