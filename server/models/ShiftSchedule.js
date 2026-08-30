/**
 * @module ShiftSchedule
 * 
 * Manages the planned assignments for a group over a specific period.
 * Handles publishing status and tracks vacation day consumption for shift assignments.
 */

const mongoose = require("mongoose");

/**
 * Represents a schedule period with individual shift assignments.
 * 
 * @class ShiftSchedule
 * @property {mongoose.Schema.Types.ObjectId} groupId - Reference to the Group this schedule belongs to.
 * @property {Date} startDate - The beginning of the schedule period.
 * @property {Date} endDate - The end of the schedule period.
 * @property {boolean} isPublished - If true, the schedule is visible to all group members.
 * @property {Object[]} shifts - Array of assignment objects.
 * @property {mongoose.Schema.Types.ObjectId} shifts.userId - Reference to the User model.
 * @property {Date} shifts.date - The specific date of the assignment.
 * @property {mongoose.Schema.Types.ObjectId} shifts.shiftTypeId - Reference to the ShiftType ID from the Group settings.
 * @property {boolean} shifts.vacationDeducted - Tracks if this assignment has been subtracted from the user's vacation balance.
 */
const ShiftScheduleSchema = new mongoose.Schema(
    {
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            required: [true, "Group reference is required"],
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"],
        },
        endDate: {
            type: Date,
            required: [true, "End date is required"],
        },
        isPublished: {
            type: Boolean,
            default: false,
        },

        shifts: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: [true, "Shift userId is required"],
                },
                date: {
                    type: Date,
                    required: [true, "Shift date is required"],
                },
                shiftTypeId: {
                    type: mongoose.Schema.Types.ObjectId,
                    required: [true, "Shift shiftTypeId is required"],
                },
                // Marks whether this specific assignment has already triggered a vacation day deduction
                vacationDeducted: {
                    type: Boolean,
                    default: false,
                },
            },
        ],
    },
    {
        timestamps: true,
    },
);

// Ensures each group has only one schedule starting on a given date.
ShiftScheduleSchema.index({ groupId: 1, startDate: 1 }, { unique: true });

// Optimizes queries looking for active published schedules covering a specific date range
ShiftScheduleSchema.index({ groupId: 1, isPublished: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model("ShiftSchedule", ShiftScheduleSchema);
