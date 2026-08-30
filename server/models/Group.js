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
    name: {
        type: String,
        required: [true, "Shift type name is required"],
        trim: true,
    },
    color: {
        type: String,
        required: [true, "Shift type color is required"],
        default: "#1976d2",
        match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color format (e.g. #1976d2)"],
    },
    isVacation: {
        type: Boolean,
        default: false,
    },
});

/**
 * Schema for Time Slots within a group.
 * Defines the daily working periods and their associated shift types.
 * 
 * @property {string} name - Name of the time slot (e.g., "08:00 - 16:00").
 * @property {string} startTime - Start time in 24-hour HH:mm format.
 * @property {string} endTime - End time in 24-hour HH:mm format.
 * @property {mongoose.Schema.Types.ObjectId[]} linkedShiftTypes - Array of ShiftType IDs linked to this slot.
 */
const TimeSlotSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Time slot name is required"],
        trim: true,
    },
    startTime: {
        type: String,
        required: [true, "Start time is required"],
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time format. Must be 24-hour HH:mm (e.g. 08:00)"],
    },
    endTime: {
        type: String,
        required: [true, "End time is required"],
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time format. Must be 24-hour HH:mm (e.g. 16:00)"],
    },
    linkedShiftTypes: [
        {
            type: mongoose.Schema.Types.ObjectId,
        },
    ],
});

/**
 * Main Group Schema.
 * Represents a team with its specific configurations, members, and resources.
 * 
 * @class Group
 * @property {string} name - Unique display name of the group.
 * @property {mongoose.Schema.Types.ObjectId[]} members - List of member IDs referencing the User model.
 * @property {Object} settings - Configuration settings for shifts and slots.
 * @property {string[]} siteTags - List of tags used to categorize sites within the group.
 * @property {Date} createdAt - Timestamp of when the group was created.
 * @property {Date} updatedAt - Timestamp of the most recent modification.
 */
const GroupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Group name is required"],
            unique: true,
            trim: true,
        },
        members: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
            ],
            default: [],
        },
        settings: {
            shiftTypes: {
                type: [ShiftTypeSchema],
                default: [],
            },
            timeSlots: {
                type: [TimeSlotSchema],
                default: [],
            },
        },
        siteTags: {
            type: [String],
            default: ["General"],
        },
    },
    { timestamps: true },
);

module.exports = mongoose.model("Group", GroupSchema);
