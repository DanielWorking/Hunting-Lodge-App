/**
 * @module ScheduleRoutes
 * 
 * Provides API endpoints for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 */

const express = require("express");
const router = express.Router();
const ShiftSchedule = require("../models/ShiftSchedule");
const User = require("../models/User");
const Group = require("../models/Group");

const { protect } = require("../middleware/authMiddleware");

// Use protect middleware for all routes in this file
// (Alternatively, it can be added specifically to each route: router.get('/', protect, ...))
router.use(protect);

/**
 * GET /
 * 
 * Retrieves a specific schedule for a group based on a start date.
 * Filters unpublished schedules for non-privileged users.
 * 
 * @name getSchedule
 * @route {GET} /
 * @authentication Requires valid JWT.
 * @query {string} groupId - The ID of the group.
 * @query {string} date - The start date of the schedule (ISO string).
 * @returns {Object} 200 - The ShiftSchedule document, or null if not found.
 * @returns {Error}  400 - If groupId or date is missing.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/", async (req, res) => {
    try {
        const { groupId, date } = req.query;
        if (!groupId || !date)
            return res.status(400).json({ message: "Missing groupId or date" });

        const startDate = new Date(date);

        // --- Permission check (cleaner) ---
        let isPrivileged = false;

        // req.user exists thanks to the middleware!
        if (req.user) {
            const isAdmin = req.user.username === "Admin";

            const isShiftManager = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager",
            );

            if (isAdmin || isShiftManager) {
                isPrivileged = true;
            }
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
});

/**
 * PUT /
 * 
 * Saves or updates a shift schedule.
 * Handles vacation day refunds if a previously published vacation shift is changed.
 * 
 * @name saveSchedule
 * @route {PUT} /
 * @authentication Requires valid JWT.
 * @bodyparam {string} groupId - The ID of the group.
 * @bodyparam {string} startDate - Start date of the schedule.
 * @bodyparam {string} endDate - End date of the schedule.
 * @bodyparam {Object[]} shifts - Array of shift assignments.
 * @returns {Object} 200 - The updated/saved ShiftSchedule document.
 * @returns {Error}  400 - If validation fails or update error occurs.
 * @returns {Error}  401 - If user is not authenticated.
 */
router.put("/", async (req, res) => {
    // Additional protection: only a registered user can save
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, startDate, endDate, shifts } = req.body;

        // Here you can add a check that req.user is indeed a manager in this group
        // But for simplicity, we will leave the original working logic

        const oldSchedule = await ShiftSchedule.findOne({ groupId, startDate });

        if (oldSchedule && oldSchedule.isPublished) {
            const group = await Group.findById(groupId);
            const vacationTypeIds = group.settings.shiftTypes
                .filter((t) => t.isVacation)
                .map((t) => String(t._id));

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
});

/**
 * POST /publish
 * 
 * Publishes a schedule, making it visible to all group members.
 * Automatically deducts vacation days from users assigned to vacation shifts.
 * 
 * @name publishSchedule
 * @route {POST} /publish
 * @authentication Requires valid JWT.
 * @bodyparam {string} scheduleId - The ObjectId of the schedule to publish.
 * @returns {Object} 200 - The published ShiftSchedule document.
 * @returns {Error}  404 - If schedule or group is not found.
 * @returns {Error}  500 - Internal server error.
 */
router.post("/publish", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { scheduleId } = req.body;
        const schedule = await ShiftSchedule.findById(scheduleId);
        if (!schedule)
            return res.status(404).json({ message: "Schedule not found" });

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
});

/**
 * GET /all
 * 
 * Retrieves all schedules for a specific group.
 * Filters unpublished schedules for non-privileged users.
 * 
 * @name getAllSchedules
 * @route {GET} /all
 * @authentication Requires valid JWT.
 * @query {string} groupId - The ID of the group.
 * @returns {Array<Object>} 200 - List of ShiftSchedule documents.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/all", async (req, res) => {
    try {
        const { groupId } = req.query;
        let query = { groupId };

        // Using req.user from the middleware
        let isPrivileged = false;
        if (req.user) {
            const isAdmin = req.user.username === "Admin";
            const isShiftManager = req.user.groups.some(
                (g) =>
                    g.groupId.toString() === groupId &&
                    g.role === "shift_manager",
            );
            if (isAdmin || isShiftManager) isPrivileged = true;
        }

        if (!isPrivileged) {
            query.isPublished = true;
        }

        const schedules = await ShiftSchedule.find(query);
        res.json(schedules);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
