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
            required: true,
        },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        isPublished: { type: Boolean, default: false },

        shifts: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                date: { type: Date, required: true },
                shiftTypeId: {
                    type: mongoose.Schema.Types.ObjectId,
                    required: true,
                },
                // Marks whether this specific assignment has already triggered a vacation day deduction
                vacationDeducted: { type: Boolean, default: false },
            },
        ],
    },
    {
        timestamps: true,
    },
);

// Ensures each group has only one schedule starting on a given date.
ShiftScheduleSchema.index({ groupId: 1, startDate: 1 }, { unique: true });

module.exports = mongoose.model("ShiftSchedule", ShiftScheduleSchema);
