const express = require("express");
const router = express.Router();
const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const Group = require("../models/Group");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// Get All
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, year, month, day } = req.query;
        if (!groupId)
            return res.status(400).json({ message: "Missing groupId" });

        let query = { groupId };

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

// Create
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { groupId, title, startTime, endTime } = req.body;

        const lastReport = await ShiftReport.findOne({ groupId }).sort({
            startTime: -1,
        });
        const previousTasks = lastReport ? lastReport.currentTasks : "";

        let attendees = [];
        const reportStart = new Date(startTime);

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

            const matchingSlot = group.settings.timeSlots.find((slot) => {
                const [h, m] = slot.startTime.split(":").map(Number);
                const slotVal = h * 60 + m;
                return Math.abs(slotVal - reportTimeVal) < 5;
            });

            const relevantShiftTypeIds = matchingSlot
                ? matchingSlot.linkedShiftTypes
                : null;

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

// Update
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

// Delete
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
