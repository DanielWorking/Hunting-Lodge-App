/**
 * @module SchedulesController
 * 
 * Handlers for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 */

const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");
const Group = require("../models/Group");

exports.getSchedule = async (req, res) => {
    try {
        const { groupId, date } = req.query;
        if (!groupId || !date)
            return res.status(400).json({ message: "Missing groupId or date" });

        const startDate = new Date(date);

        // --- Permission check: Only shift managers can view unpublished draft schedules ---
        let isPrivileged = false;

        if (req.user && req.user.groups) {
            isPrivileged = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager",
            );
        }

        let query = {
            groupId,
            startDate: startDate.toISOString(),
        };

        if (!isPrivileged) {
            query.isPublished = true;
        }

        const schedule = await ShiftSchedule.findOne(query);
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.saveSchedule = async (req, res) => {
    try {
        const { groupId, startDate, endDate, shifts } = req.body;
        if (!groupId) {
            return res.status(400).json({ message: "Missing groupId" });
        }

        // Authorization check: Only a shift manager of this group can save schedules
        const isShiftManager = req.user?.groups?.some(
            (g) =>
                g.groupId.toString() === groupId.toString() &&
                g.role === "shift_manager",
        );

        if (!isShiftManager) {
            return res.status(403).json({
                message:
                    "Not authorized: You must be a Shift Manager of this group to save schedules.",
            });
        }

        const oldSchedule = await ShiftSchedule.findOne({ groupId, startDate });

        if (oldSchedule && oldSchedule.isPublished) {
            const group = await Group.findById(groupId);
            const vacationTypeIds = group?.settings?.shiftTypes
                ?.filter((t) => t.isVacation)
                ?.map((t) => String(t._id)) || [];

            if (vacationTypeIds.length > 0) {
                for (const oldShift of oldSchedule.shifts) {
                    if (oldShift.vacationDeducted) {
                        const stillExistsAsVacation = shifts.find(
                            (newShift) =>
                                newShift.userId === oldShift.userId &&
                                new Date(newShift.date).toISOString() ===
                                    new Date(oldShift.date).toISOString() &&
                                vacationTypeIds.includes(
                                    String(newShift.shiftTypeId),
                                ),
                        );

                        if (!stillExistsAsVacation) {
                            console.log(
                                `♻️ Refunding vacation day to user ${oldShift.userId}`,
                            );
                            await User.findByIdAndUpdate(oldShift.userId, {
                                $inc: { vacationBalance: 1 },
                            });
                        }
                    }
                }
            }

            shifts.forEach((newShift) => {
                const matchingOldShift = oldSchedule.shifts.find(
                    (old) =>
                        old.userId === newShift.userId &&
                        new Date(old.date).toISOString() ===
                            new Date(newShift.date).toISOString() &&
                        old.shiftTypeId === newShift.shiftTypeId,
                );

                if (matchingOldShift && matchingOldShift.vacationDeducted) {
                    newShift.vacationDeducted = true;
                }
            });
        }

        const schedule = await ShiftSchedule.findOneAndUpdate(
            { groupId, startDate },
            { groupId, startDate, endDate, shifts },
            { new: true, upsert: true },
        );

        res.json(schedule);
    } catch (err) {
        console.error("Error saving schedule:", err);
        res.status(400).json({ message: err.message });
    }
};

exports.publishSchedule = async (req, res) => {
    try {
        const { scheduleId } = req.body;
        const schedule = await ShiftSchedule.findById(scheduleId);
        if (!schedule)
            return res.status(404).json({ message: "Schedule not found" });

        // Authorization check: Only a shift manager of this group can publish schedules
        const isShiftManager = req.user?.groups?.some(
            (g) =>
                g.groupId.toString() === schedule.groupId.toString() &&
                g.role === "shift_manager",
        );

        if (!isShiftManager) {
            return res.status(403).json({
                message:
                    "Not authorized: You must be a Shift Manager of this group to publish schedules.",
            });
        }

        const group = await Group.findById(schedule.groupId);
        if (!group) return res.status(404).json({ message: "Group not found" });

        const vacationTypeIds = group.settings.shiftTypes
            .filter((t) => t.isVacation)
            .map((t) => String(t._id));

        let updatesCount = 0;

        if (vacationTypeIds.length > 0) {
            for (let i = 0; i < schedule.shifts.length; i++) {
                const shift = schedule.shifts[i];
                const shiftTypeIdStr = String(shift.shiftTypeId);

                if (
                    vacationTypeIds.includes(shiftTypeIdStr) &&
                    !shift.vacationDeducted
                ) {
                    await User.findByIdAndUpdate(shift.userId, {
                        $inc: { vacationBalance: -1 },
                    });
                    shift.vacationDeducted = true;
                    updatesCount++;
                }
            }
        }

        schedule.isPublished = true;
        schedule.markModified("shifts");
        await schedule.save();

        res.json(schedule);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.getAllSchedules = async (req, res) => {
    try {
        const { groupId } = req.query;
        let query = { groupId };

        // Permission check: Only shift managers can view unpublished draft schedules
        let isPrivileged = false;
        if (req.user && req.user.groups) {
            isPrivileged = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager",
            );
        }

        if (!isPrivileged) {
            query.isPublished = true;
        }

        const schedules = await ShiftSchedule.find(query);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
