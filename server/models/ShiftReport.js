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
 * @property {mongoose.Schema.Types.ObjectId} groupId - Reference to the Group this report belongs to.
 * @property {string} title - Descriptive title for the shift report.
 * @property {Date} date - The date the shift occurred.
 * @property {string} startTime - Start time of the shift (HH:mm format).
 * @property {string} endTime - End time of the shift (HH:mm format).
 * @property {string} previousTasks - Unfinished tasks inherited from the prior shift's report.
 * @property {string} currentTasks - Rich text/HTML content detailing work performed during this shift.
 * @property {Object[]} attendees - List of personnel present during the shift.
 * @property {mongoose.Schema.Types.ObjectId} [attendees.userId] - Reference to the User model.
 * @property {string} [attendees.name] - Stored name of the user for historical records.
 * @property {boolean} [attendees.isManual] - Indicates if attendee was added manually.
 * @property {boolean} isLocked - If true, the report can no longer be edited (typically after 24 hours).
 */
const ShiftReportSchema = new mongoose.Schema(
    {
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            required: true,
            index: true,
        },

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
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
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
