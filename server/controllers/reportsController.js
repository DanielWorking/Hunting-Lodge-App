/**
 * @module ReportsController
 * 
 * Handlers for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 * 
 * Enforces strict group boundaries:
 * - Only explicit group members can view, create, and update reports.
 * - Only explicit Shift Managers of the group can delete reports.
 */

const ShiftReport = require("../models/ShiftReport");
const ShiftSchedule = require("../models/ShiftSchedule");
const Group = require("../models/Group");
const User = require("../models/User");
const { resolveGroup, isGroupMember, isShiftManager } = require("../utils/authHelpers");

exports.getReports = async (req, res) => {
    try {
        const { groupId, year, month, day } = req.query;
        if (!groupId)
            return res.status(400).json({ message: "Missing groupId" });

        const hasAccess = await isGroupMember(req.user, groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        let query = { groupId: group._id };

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
};

exports.createReport = async (req, res) => {
    try {
        const { groupId, title, startTime, endTime } = req.body;

        const hasAccess = await isGroupMember(req.user, groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // Inherit tasks from the most recent report of the same group
        const lastReport = await ShiftReport.findOne({
            groupId: group._id,
        }).sort({ startTime: -1 });
        const previousTasks = lastReport ? lastReport.currentTasks : "";

        let attendees = [];
        const reportStart = new Date(startTime);

        // Attempt to pull attendees automatically from the published schedule
        const schedule = await ShiftSchedule.findOne({
            groupId: group._id,
            isPublished: true,
            startDate: { $lte: reportStart },
            endDate: { $gte: reportStart },
        });

        if (schedule && group.settings?.timeSlots) {
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
                ? (matchingSlot.linkedShiftTypes || []).map((id) => id.toString())
                : null;

            // Filter shifts that match the date and optionally the shift type
            const shiftsToday = schedule.shifts.filter((s) => {
                const isSameDate =
                    new Date(s.date).toDateString() ===
                    reportStart.toDateString();

                const isRelevantType = relevantShiftTypeIds
                    ? relevantShiftTypeIds.includes(s.shiftTypeId.toString())
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
            groupId: group._id,
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
};

exports.updateReport = async (req, res) => {
    try {
        const report = await ShiftReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: "Report not found" });

        // Authorization: User must be an explicit member of the report's group
        const hasAccess = await isGroupMember(req.user, report.groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this report's group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        const { currentTasks, attendees, isLocked, previousTasks } = req.body;

        const updatedReport = await ShiftReport.findByIdAndUpdate(
            req.params.id,
            { currentTasks, attendees, isLocked, previousTasks },
            { new: true },
        );

        res.json(updatedReport);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteReport = async (req, res) => {
    try {
        const report = await ShiftReport.findById(req.params.id);
        if (!report) return res.status(404).json({ message: "Report not found" });

        // Authorization: Strictly Shift Manager of this group
        const isMgr = await isShiftManager(req.user, report.groupId);

        if (!isMgr) {
            return res.status(403).json({
                message: "Forbidden: Only an explicit Shift Manager of this group can delete reports.",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
        }

        await ShiftReport.findByIdAndDelete(req.params.id);
        res.json({ message: "Report deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
