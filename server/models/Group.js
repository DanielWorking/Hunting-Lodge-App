const mongoose = require("mongoose");

const ShiftTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    color: { type: String, required: true }, // hex code
    isVacation: { type: Boolean, default: false },
});

const TimeSlotSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Morning", "Night"
    startTime: { type: String, required: true }, // "07:00"
    endTime: { type: String, required: true }, // "15:00"
    linkedShiftTypes: [{ type: mongoose.Schema.Types.ObjectId }], // IDs from ShiftTypeSchema (virtual reference handled in logic)
});

const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // unique string ID (e.g., "platoon-1")
    name: { type: String, required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    settings: {
        shiftTypes: [ShiftTypeSchema],
        timeSlots: [TimeSlotSchema],
    },
    reportEmails: [{ type: String }], // רשימת אימיילים לשליחת דוחות
    siteTags: {
        type: [String],
        default: ["General"],
    }, // רשימת התגיות של הקבוצה
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Group", GroupSchema);
