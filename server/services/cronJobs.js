/**
 * @module cronJobs
 *
 * This module handles automated background tasks for the application using node-cron.
 * Its primary responsibility is to automatically generate shift reports for all groups
 * based on their defined time slots and active schedules.
 */

const cron = require("node-cron");
const mongoose = require("mongoose");
const Group = require("../models/Group");
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");

// Atomic concurrency guard to prevent overlapping cron job executions
let isJobRunning = false;

/**
 * Extracts the current hour and minute in Asia/Jerusalem timezone.
 *
 * @param {Date} [date=new Date()] - The reference date.
 * @returns {{ hour: number, minute: number }}
 */
function getTimeInJerusalem(date = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jerusalem",
            hour: "numeric",
            minute: "numeric",
            hourCycle: "h23",
        });
        const parts = formatter.formatToParts(date);
        const hourStr = parts.find((p) => p.type === "hour")?.value || "0";
        const minStr = parts.find((p) => p.type === "minute")?.value || "0";
        return {
            hour: parseInt(hourStr, 10),
            minute: parseInt(minStr, 10),
        };
    } catch {
        return { hour: date.getHours(), minute: date.getMinutes() };
    }
}

/**
 * Formats a Date into DD/MM/YYYY string in Asia/Jerusalem timezone.
 *
 * @param {Date} [date=new Date()] - The date to format.
 * @returns {string}
 */
function getJerusalemDateString(date = new Date()) {
    return date
        .toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Jerusalem",
        })
        .replace(/\./g, "/");
}

/**
 * Calculates a Date representing the given HH:mm time on the reference date in Asia/Jerusalem timezone.
 *
 * @param {Date} refDate - The reference date.
 * @param {string} timeStr - Time string formatted as "HH:mm".
 * @returns {Date}
 */
function getJerusalemDate(refDate, timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(refDate);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    const year = parseInt(get("year"), 10);
    const month = parseInt(get("month"), 10);
    const day = parseInt(get("day"), 10);

    const approx = new Date(Date.UTC(year, month - 1, day, h, m));
    const jParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(approx);
    const getJ = (type) => jParts.find((p) => p.type === type)?.value;
    const jAsUtc = Date.UTC(
        parseInt(getJ("year"), 10),
        parseInt(getJ("month"), 10) - 1,
        parseInt(getJ("day"), 10),
        parseInt(getJ("hour"), 10),
        parseInt(getJ("minute"), 10)
    );
    const offsetMs = jAsUtc - approx.getTime();
    return new Date(approx.getTime() - offsetMs);
}

/**
 * Processes a single time slot for a group, creating a ShiftReport if within trigger window and not already existing.
 *
 * @param {Object} group - The group document.
 * @param {Object} slot - The time slot configuration.
 * @param {Date} now - The current execution timestamp.
 * @param {number} currentJerusalemMinutes - Total minutes elapsed today in Jerusalem time.
 * @returns {Promise<void>}
 */
async function processGroupSlot(group, slot, now, currentJerusalemMinutes) {
    const [slotHour, slotMinute] = slot.startTime.split(":").map(Number);
    const slotTimeVal = slotHour * 60 + slotMinute;

    // Asymmetric tolerance window:
    // Allows from 1 minute before up to 5 minutes after slot start.
    // This allows recovery if Node.js event-loop lag delays cron execution by several minutes.
    const diff = currentJerusalemMinutes - slotTimeVal;
    if (diff < -1 || diff > 5) {
        return;
    }

    const formattedDate = getJerusalemDateString(now);
    const reportTitle = `${slot.name} - ${formattedDate}`;

    // Ensure idempotency: check if a report for this slot/group already exists for today.
    const existingReport = await ShiftReport.findOne({
        groupId: group._id,
        title: reportTitle,
    }).lean();

    if (existingReport) {
        return;
    }

    console.log(`[Cron] Creating auto-report for group: ${group.name}, shift: ${slot.name}`);

    // Compute timezone-correct shift start and end times
    const shiftStart = getJerusalemDate(now, slot.startTime);
    const shiftEnd = getJerusalemDate(now, slot.endTime);

    // Adjust end date if the shift spans across midnight
    if (shiftEnd < shiftStart) {
        shiftEnd.setTime(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // Parallelize previous report and published schedule lookups with lean()
    const [lastReport, schedule] = await Promise.all([
        ShiftReport.findOne({ groupId: group._id }).sort({ startTime: -1 }).lean(),
        ShiftSchedule.findOne({
            groupId: group._id,
            isPublished: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean(),
    ]);

    const previousTasks = lastReport ? lastReport.currentTasks || "" : "";
    let attendees = [];

    if (schedule) {
        const relevantShiftTypeIds = (slot.linkedShiftTypes || []).map(String);
        const nowJerusalemDate = getJerusalemDateString(now);

        // Filter shifts from the schedule that match today's date in Jerusalem and the slot's shift types.
        const shiftsToday = (schedule.shifts || []).filter((s) => {
            const shiftJerusalemDate = getJerusalemDateString(new Date(s.date));
            const isSameDate = shiftJerusalemDate === nowJerusalemDate;
            const isRelevantType =
                relevantShiftTypeIds.length === 0 ||
                relevantShiftTypeIds.includes(String(s.shiftTypeId));
            return isSameDate && isRelevantType;
        });

        const userIds = shiftsToday.map((s) => s.userId);
        if (userIds.length > 0) {
            const users = await User.find({ _id: { $in: userIds } }).lean();
            attendees = users.map((u) => ({
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
            endTime: shiftEnd.toISOString(),
            previousTasks,
            attendees,
            currentTasks: "",
            isLocked: false,
        });

        await newReport.save();
        console.log(`[Cron] Successfully saved new report for ${group.name}`);
    } catch (saveError) {
        // Handle race conditions where another worker or process inserted the same report
        if (saveError.code === 11000) {
            console.warn(`[Cron] Report already exists (duplicate key) for ${group.name} - ${slot.name}`);
        } else {
            console.error(`[Cron] Error saving report for ${group.name}:`, saveError);
        }
    }
}

/**
 * Main worker routine that queries groups and generates shift reports.
 *
 * @param {Date} [now=new Date()] - Execution timestamp.
 * @returns {Promise<void>}
 */
async function runShiftReportGenerator(now = new Date()) {
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

        const groups = await Group.find({}).lean();

        await Promise.allSettled(
            groups.map(async (group) => {
                if (!group.settings || !group.settings.timeSlots) return;
                for (const slot of group.settings.timeSlots) {
                    try {
                        await processGroupSlot(group, slot, now, currentJerusalemMinutes);
                    } catch (slotError) {
                        console.error(
                            `[Cron] Error processing slot ${slot?.name} for group ${group?.name || group?._id}:`,
                            slotError
                        );
                    }
                }
            })
        );
    } catch (error) {
        console.error("[Cron] Error generating shift reports:", error);
    } finally {
        isJobRunning = false;
    }
}

/**
 * Scheduled job that runs every minute to check for upcoming shift starts.
 */
const job = cron.schedule("* * * * *", () => {
    runShiftReportGenerator().catch((err) => {
        console.error("[Cron] Unhandled rejection in scheduled task:", err);
    });
});

/**
 * Gracefully stops the cron scheduler.
 */
const stopCronJobs = () => {
    if (job && typeof job.stop === "function") {
        job.stop();
    }
};

module.exports = {
    job,
    runShiftReportGenerator,
    stopCronJobs,
    getTimeInJerusalem,
    getJerusalemDateString,
    getJerusalemDate,
};
