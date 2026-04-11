/**
 * @module ReportRoutes
 * 
 * Provides API endpoints for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 */

const express = require("express");
const router = express.Router();
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const Group = require("../models/Group");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves shift reports for a specific group, with optional temporal filtering.
 * 
 * @name getReports
 * @route {GET} /
 * @authentication Requires valid JWT.
 * @query {string} groupId - The ID of the group to fetch reports for.
 * @query {number} [year] - Filter by year.
 * @query {number} [month] - Filter by month (1-12).
 * @query {number} [day] - Filter by day of the month.
 * @returns {Array<Object>} 200 - List of ShiftReport documents, sorted by start time descending.
 * @returns {Error}  400 - If groupId is missing.
 * @returns {Error}  401 - If user is not authenticated.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, year, month, day } = req.query;
        if (!groupId)
            return res.status(400).json({ message: "Missing groupId" });

        let query = { groupId };

        // Handle temporal filtering logic
        if (year) {
            const startDate = new Date(year, month ? month - 1 : 0, day || 1);
            const endDate = new Date(year, month ? month : 12, 0, 23, 59, 59);

            if (day) {
                endDate.setMonth(startDate.getMonth());
                endDate.setDate(startDate.getDate());
                endDate.setHours(23, 59, 59);
            }

            query.startTime = { $gte: startDate, $lte: endDate };
        }

        const reports = await ShiftReport.find(query).sort({ startTime: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /
 * 
 * Creates a new shift report.
 * Automatically inherits pending tasks from the previous report and attempts
 * to identify attendees based on the published shift schedule.
 * 
 * @name createReport
 * @route {POST} /
 * @authentication Requires valid JWT.
 * @bodyparam {string} groupId - The ID of the group.
 * @bodyparam {string} title - The title of the report.
 * @bodyparam {string} startTime - ISO date string for the shift start.
 * @bodyparam {string} endTime - ISO date string for the shift end.
 * @returns {Object} 201 - The newly created ShiftReport document.
 * @returns {Error}  400 - If validation fails or data is malformed.
 * @returns {Error}  401 - If user is not authenticated.
 */
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, title, startTime, endTime } = req.body;

        // Inherit tasks from the most recent report of the same group
        const lastReport = await ShiftReport.findOne({ groupId }).sort({
            startTime: -1,
        });
        const previousTasks = lastReport ? lastReport.currentTasks : "";

        let attendees = [];
        const reportStart = new Date(startTime);

        // Attempt to pull attendees automatically from the published schedule
        const schedule = await ShiftSchedule.findOne({
            groupId,
            isPublished: true,
            startDate: { $lte: reportStart },
            endDate: { $gte: reportStart },
        });

        if (schedule) {
            const group = await Group.findById(groupId);
            const reportStartHour = reportStart.getHours();
            const reportStartMinute = reportStart.getMinutes();
            const reportTimeVal = reportStartHour * 60 + reportStartMinute;

            // Match report start time with defined time slots in group settings
            const matchingSlot = group.settings.timeSlots.find((slot) => {
                const [h, m] = slot.startTime.split(":").map(Number);
                const slotVal = h * 60 + m;
                return Math.abs(slotVal - reportTimeVal) < 5;
            });

            const relevantShiftTypeIds = matchingSlot
                ? matchingSlot.linkedShiftTypes
                : null;

            // Filter shifts that match the date and optionally the shift type
            const shiftsToday = schedule.shifts.filter((s) => {
                const isSameDate =
                    new Date(s.date).toDateString() ===
                    reportStart.toDateString();

                const isRelevantType = relevantShiftTypeIds
                    ? relevantShiftTypeIds.includes(s.shiftTypeId)
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
            groupId,
            title,
            date: reportStart,
            startTime,
            endTime,
            previousTasks,
            attendees,
            currentTasks: "",
        });

        const savedReport = await newReport.save();
        res.status(201).json(savedReport);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message });
    }
});

/**
 * PUT /:id
 * 
 * Updates an existing shift report.
 * 
 * @name updateReport
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the report to update.
 * @bodyparam {string} [currentTasks] - Updated work documentation.
 * @bodyparam {Object[]} [attendees] - Updated list of attendees.
 * @bodyparam {boolean} [isLocked] - Lock status for the report.
 * @bodyparam {string} [previousTasks] - Manually updated previous tasks.
 * @returns {Object} 200 - The updated ShiftReport document.
 * @returns {Error}  400 - If update fails.
 * @returns {Error}  401 - If user is not authenticated.
 */
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { currentTasks, attendees, isLocked, previousTasks } = req.body;

        const updatedReport = await ShiftReport.findByIdAndUpdate(
            req.params.id,
            { currentTasks, attendees, isLocked, previousTasks },
            { new: true }
        );

        res.json(updatedReport);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/**
 * DELETE /:id
 * 
 * Deletes a shift report from the database.
 * 
 * @name deleteReport
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the report to delete.
 * @returns {Object} 200 - Success message.
 * @returns {Error}  401 - If user is not authenticated.
 * @returns {Error}  500 - Internal server error.
 */
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        await ShiftReport.findByIdAndDelete(req.params.id);
        res.json({ message: "Report deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
