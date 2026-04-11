/**
 * @module Group
 * 
 * Defines the Group model which represents an organizational unit or team.
 * Groups have their own settings, such as shift types, time slots, and members.
 * They also manage their own reporting configurations and resource tags.
 */

const mongoose = require("mongoose");

/**
 * Schema for Shift Types within a group.
 * Defines the categories of shifts (e.g., Morning, Night, Vacation).
 * 
 * @property {string} name - Name of the shift type (e.g., "Morning").
 * @property {string} color - Hex color code for UI representation.
 * @property {boolean} isVacation - Indicates if this shift type represents a vacation.
 */
const ShiftTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    color: { type: String, required: true },
    isVacation: { type: Boolean, default: false },
});

/**
 * Schema for Time Slots within a group.
 * Defines the daily working periods and their associated shift types.
 * 
 * @property {string} name - Name of the time slot (e.g., "08:00 - 16:00").
 * @property {string} startTime - Start time in HH:mm format.
 * @property {string} endTime - End time in HH:mm format.
 * @property {mongoose.Schema.Types.ObjectId[]} linkedShiftTypes - Array of ShiftType IDs linked to this slot.
 */
const TimeSlotSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    linkedShiftTypes: [{ type: mongoose.Schema.Types.ObjectId }], // IDs from ShiftTypeSchema (virtual reference handled in logic)
});

/**
 * Main Group Schema.
 * Represents a team with its specific configurations, members, and resources.
 * 
 * @class Group
 * @property {string} id - Unique string identifier for the group (e.g., "ops-team").
 * @property {string} name - Display name of the group.
 * @property {mongoose.Schema.Types.ObjectId[]} members - List of member IDs referencing the User model.
 * @property {Object} settings - Configuration settings for shifts and slots.
 * @property {string[]} reportEmails - List of email addresses to receive shift reports.
 * @property {string[]} siteTags - List of tags used to categorize sites within the group.
 * @property {Date} createdAt - Timestamp of when the group was created.
 */
const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    settings: {
        shiftTypes: [ShiftTypeSchema],
        timeSlots: [TimeSlotSchema],
    },
    reportEmails: [{ type: String }],
    siteTags: {
        type: [String],
        default: ["General"],
    },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Group", GroupSchema);
