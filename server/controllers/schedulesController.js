/**
 * @module SchedulesController
 * 
 * Handlers for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 * 
 * Enforces strict role checks: only explicit Shift Managers of a group can
 * view drafts, save schedules, and publish schedules.
 */

const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");
const Group = require("../models/Group");
const { isShiftManager, resolveGroup } = require("../utils/authHelpers");

exports.getSchedule = async (req, res) => {
    try {
        const { groupId, date } = req.query;
        if (!groupId || !date) {
            return res.status(400).json({ message: "Missing groupId or date" });
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        const startDate = new Date(date);

        // Permission check: Only explicit shift managers of this group can view draft schedules
        const canViewDrafts = await isShiftManager(req.user, group._id);

        let query = {
            groupId: group._id,
            startDate: startDate.toISOString(),
        };

        if (!canViewDrafts) {
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

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // Strict Authorization: Only an explicit shift manager of this group can save schedules
        const userIsManager = await isShiftManager(req.user, group._id);
        if (!userIsManager) {
            return res.status(403).json({
                message: "Forbidden: You must be an explicit Shift Manager of this group to save schedules.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
        }

        const oldSchedule = await ShiftSchedule.findOne({
            groupId: group._id,
            startDate,
        });

        if (oldSchedule && oldSchedule.isPublished) {
            const vacationTypeIds = (group?.settings?.shiftTypes || [])
                .filter((t) => t.isVacation)
                .map((t) => t._id.toString());

            if (vacationTypeIds.length > 0) {
                for (const oldShift of oldSchedule.shifts) {
                    if (oldShift.vacationDeducted) {
                        const stillExistsAsVacation = (shifts || []).find(
                            (newShift) =>
                                String(newShift.userId) === String(oldShift.userId) &&
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

            (shifts || []).forEach((newShift) => {
                const matchingOldShift = oldSchedule.shifts.find(
                    (old) =>
                        String(old.userId) === String(newShift.userId) &&
                        new Date(old.date).toISOString() ===
                            new Date(newShift.date).toISOString() &&
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
        if (!scheduleId) {
            return res.status(400).json({ message: "Missing scheduleId" });
        }

        const schedule = await ShiftSchedule.findById(scheduleId);
        if (!schedule) {
            return res.status(404).json({ message: "Schedule not found" });
        }

        const group = await resolveGroup(schedule.groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found for schedule" });
        }

        // Strict Authorization: Only an explicit shift manager of this group can publish schedules
        const userIsManager = await isShiftManager(req.user, group._id);
        if (!userIsManager) {
            return res.status(403).json({
                message: "Forbidden: You must be an explicit Shift Manager of this group to publish schedules.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
        }

        const vacationTypeIds = (group.settings?.shiftTypes || [])
            .filter((t) => t.isVacation)
            .map((t) => t._id.toString());

        let updatesCount = 0;
        const deductedUserIds = [];

        if (vacationTypeIds.length > 0) {
            for (let i = 0; i < schedule.shifts.length; i++) {
                const shift = schedule.shifts[i];
                const shiftTypeIdStr = String(shift.shiftTypeId);

                if (
                    vacationTypeIds.includes(shiftTypeIdStr) &&
                    !shift.vacationDeducted
                ) {
                    // Atomically decrement only if user has a positive balance to prevent negative balance underflow
                    const updatedUser = await User.findOneAndUpdate(
                        { _id: shift.userId, vacationBalance: { $gt: 0 } },
                        { $inc: { vacationBalance: -1 } },
                        { new: true },
                    );

                    if (updatedUser) {
                        shift.vacationDeducted = true;
                        deductedUserIds.push(shift.userId);
                        updatesCount++;
                    } else {
                        console.warn(`[PublishSchedule] User ${shift.userId} has 0 vacation balance; balance deduction skipped to prevent underflow.`);
                    }
                }
            }
        }

        try {
            schedule.isPublished = true;
            schedule.markModified("shifts");
            await schedule.save();
        } catch (saveErr) {
            // Rollback any deducted balances if schedule save fails
            for (const userId of deductedUserIds) {
                await User.findByIdAndUpdate(userId, { $inc: { vacationBalance: 1 } }).catch(() => {});
            }
            throw saveErr;
        }

        res.json(schedule);
    } catch (err) {
        console.error("Error publishing schedule:", err);
        res.status(500).json({ message: err.message });
    }
};

exports.getAllSchedules = async (req, res) => {
    try {
        const { groupId } = req.query;
        if (!groupId) {
            return res.status(400).json({ message: "Missing groupId" });
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // Permission check: Only explicit shift managers of this group can view draft schedules
        const canViewDrafts = await isShiftManager(req.user, group._id);

        let query = { groupId: group._id };

        if (!canViewDrafts) {
            query.isPublished = true;
        }

        const schedules = await ShiftSchedule.find(query);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
