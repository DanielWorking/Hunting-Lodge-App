/**
 * @module ShiftReport
 * 
 * Captures the operational history and tasks completed during a specific shift.
 * Reports are used for knowledge transfer between shifts and historical logging.
 */

const mongoose = require("mongoose");

/**
 * Represents a completed shift's output and attendance.
 * 
 * @class ShiftReport
 * @property {string} groupId - The identifier of the group this report belongs to.
 * @property {string} title - Descriptive title for the shift report.
 * @property {Date} date - The date the shift occurred.
 * @property {string} startTime - Start time of the shift (HH:mm format).
 * @property {string} endTime - End time of the shift (HH:mm format).
 * @property {string} previousTasks - Unfinished tasks inherited from the prior shift's report.
 * @property {string} currentTasks - Rich text/HTML content detailing work performed during this shift.
 * @property {Object[]} attendees - List of personnel present during the shift.
 * @property {boolean} isLocked - If true, the report can no longer be edited (typically after 24 hours).
 */
const ShiftReportSchema = new mongoose.Schema(
    {
        groupId: { type: String, required: true },

        // Title and times
        title: { type: String, required: true },
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },

        // Report content
        previousTasks: { type: String, default: "" }, // Automatically copied from the previous report
        currentTasks: { type: String, default: "" }, // HTML/Rich Text from the editor

        // Attendance
        attendees: [
            {
                userId: { type: String },
                name: { type: String }, // Storing the name in case the user is deleted in the future (history)
                isManual: { type: Boolean, default: false }, // Was added manually or pulled from the schedule?
            },
        ],

        // Is the report locked for editing? (After 24 hours)
        isLocked: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    },
);

module.exports = mongoose.model("ShiftReport", ShiftReportSchema);
