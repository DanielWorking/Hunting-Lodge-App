const mongoose = require("mongoose");

const ShiftTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    color: { type: String, required: true },
    isVacation: { type: Boolean, default: false },
});

const TimeSlotSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    linkedShiftTypes: [{ type: String }],
});

const GroupSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true },

        // === התיקון: הפיכת השדה למערך של מחרוזות ===
        reportEmails: [{ type: String }],

        members: [{ type: String }],

        settings: {
            shiftTypes: [ShiftTypeSchema],
            timeSlots: [TimeSlotSchema],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Group", GroupSchema);
