/**
 * @module cronJobs
 *
 * This module handles automated background tasks for the application using node-cron.
 * Its primary responsibility is to automatically generate shift reports for all groups
 * based on their defined time slots and active schedules.
 */

const cron = require("node-cron");
const Group = require("../models/Group");
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");

/**
 * Scheduled job that runs every minute to check for upcoming shift starts.
 *
 * For each group, it iterates through defined time slots. If the current time
 * matches a slot's start time (within a 1-minute window), it creates a new
 * ShiftReport if one doesn't already exist for that specific slot and date.
 *
 * The job also handles:
 * - Cross-day shift end times.
 * - Inheriting tasks from the previous report.
 * - Automatically populating attendees from the published schedule.
 */
cron.schedule("* * * * *", async () => {
    try {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Convert current time to total minutes for easier comparison with slot times.
        const currentTimeVal = currentHour * 60 + currentMinute;

        const groups = await Group.find({});

        for (const group of groups) {
            // Skip groups without configured time slots.
            if (!group.settings || !group.settings.timeSlots) continue;

            for (const slot of group.settings.timeSlots) {
                const [slotHour, slotMinute] = slot.startTime
                    .split(":")
                    .map(Number);
                const slotTimeVal = slotHour * 60 + slotMinute;

                // Check if the current time matches the shift start (1-minute tolerance).
                if (Math.abs(slotTimeVal - currentTimeVal) <= 1) {
                    // Calculate full start and end dates for the shift.
                    const shiftStart = new Date(now);
                    shiftStart.setHours(slotHour, slotMinute, 0, 0);

                    const [endH, endM] = slot.endTime.split(":").map(Number);
                    const shiftEnd = new Date(now);
                    shiftEnd.setHours(endH, endM, 0, 0);

                    // Adjust end date if the shift spans across midnight.
                    if (shiftEnd < shiftStart) {
                        shiftEnd.setDate(shiftEnd.getDate() + 1);
                    }

                    // Generate a unique title for the report based on slot name and Hebrew locale date.
                    const formattedDate = now
                        .toLocaleDateString("he-IL", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        })
                        .replace(/\./g, "/");

                    const reportTitle = `${slot.name} - ${formattedDate}`;

                    // Ensure idempotency: check if a report for this slot/group already exists for today.
                    const existingReport = await ShiftReport.findOne({
                        groupId: group._id,
                        title: reportTitle,
                    });

                    if (!existingReport) {
                        console.log(
                            `[Cron] Creating auto-report for group: ${group.name}, shift: ${slot.name}`,
                        );

                        // Inherit 'currentTasks' from the most recent previous report as 'previousTasks'.
                        const lastReport = await ShiftReport.findOne({
                            groupId: group._id,
                        }).sort({ startTime: -1 });

                        const previousTasks = lastReport
                            ? lastReport.currentTasks
                            : "";

                        let attendees = [];

                        // Attempt to find the published schedule covering the current date.
                        const schedule = await ShiftSchedule.findOne({
                            groupId: group._id,
                            isPublished: true,
                            startDate: { $lte: now },
                            endDate: { $gte: now },
                        });

                        if (schedule) {
                            const relevantShiftTypeIds =
                                slot.linkedShiftTypes || [];

                            // Filter shifts from the schedule that match today's date and the slot's shift types.
                            const shiftsToday = schedule.shifts.filter((s) => {
                                const isSameDate =
                                    new Date(s.date).toDateString() ===
                                    now.toDateString();
                                const isRelevantType =
                                    relevantShiftTypeIds.includes(
                                        s.shiftTypeId.toString(),
                                    );
                                return isSameDate && isRelevantType;
                            });

                            const userIds = shiftsToday.map((s) => s.userId);
                            const users = await User.find({
                                _id: { $in: userIds },
                            });

                            attendees = users.map((u) => ({
                                userId: u._id,
                                name: u.username,
                                isManual: false,
                            }));
                        }

                        // Initialize and save the new automated ShiftReport.
                        const newReport = new ShiftReport({
                            groupId: group._id,
                            title: reportTitle,
                            date: now,
                            startTime: shiftStart.toISOString(), // Stored in ISO format for consistent sorting and retrieval.
                            endTime: shiftEnd.toISOString(),
                            previousTasks: previousTasks,
                            attendees: attendees,
                            currentTasks: "",
                            isLocked: false,
                        });

                        await newReport.save();
                        console.log(
                            `[Cron] Successfully saved new report for ${group.name}`,
                        );
                    }
                }
            }
        }
    } catch (error) {
        console.error("[Cron] Error generating shift reports:", error);
    }
});
