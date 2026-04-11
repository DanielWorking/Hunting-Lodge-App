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

        // כותרת וזמנים
        title: { type: String, required: true },
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },

        // תוכן הדוח
        previousTasks: { type: String, default: "" }, // הועתק אוטומטית מהדוח הקודם
        currentTasks: { type: String, default: "" }, // HTML/Rich Text מהעורך

        // נוכחות
        attendees: [
            {
                userId: { type: String },
                name: { type: String }, // שומרים את השם למקרה שהמשתמש יימחק בעתיד (היסטוריה)
                isManual: { type: Boolean, default: false }, // האם הוסף ידנית או נמשך מהלוח?
            },
        ],

        // האם הדוח ננעל לעריכה? (אחרי 24 שעות)
        isLocked: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    },
);

module.exports = mongoose.model("ShiftReport", ShiftReportSchema);
