const mongoose = require("mongoose");

const ShiftScheduleSchema = new mongoose.Schema(
    {
        groupId: { type: String, required: true },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        isPublished: { type: Boolean, default: false },

        shifts: [
            {
                userId: { type: String, required: true },
                date: { type: Date, required: true },
                shiftTypeId: { type: String, required: true },
                // === השדה החדש ===
                // מסמן האם השיבוץ הספציפי הזה כבר גרר הורדת יום חופש
                vacationDeducted: { type: Boolean, default: false },
            },
        ],
    },
    {
        timestamps: true,
    }
);

ShiftScheduleSchema.index({ groupId: 1, startDate: 1 }, { unique: true });

module.exports = mongoose.model("ShiftSchedule", ShiftScheduleSchema);
