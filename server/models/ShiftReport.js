const mongoose = require("mongoose");

const ShiftReportSchema = new mongoose.Schema(
    {
        groupId: { type: String, required: true },

        // כותרת וזמנים [cite: 66]
        title: { type: String, required: true }, // "משמרת בוקר - 25.11.2025"
        date: { type: Date, required: true },
        startTime: { type: String, required: true }, // "07:00"
        endTime: { type: String, required: true }, // "15:00"

        // תוכן הדוח [cite: 67-68]
        previousTasks: { type: String, default: "" }, // הועתק אוטומטית מהדוח הקודם
        currentTasks: { type: String, default: "" }, // HTML/Rich Text מהעורך

        // נוכחות [cite: 69]
        attendees: [
            {
                userId: { type: String },
                name: { type: String }, // שומרים את השם למקרה שהמשתמש יימחק בעתיד (היסטוריה)
                isManual: { type: Boolean, default: false }, // האם הוסף ידנית או נמשך מהלוח?
            },
        ],

        // האם הדוח ננעל לעריכה? (אחרי 24 שעות) [cite: 75]
        isLocked: { type: Boolean, default: false },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("ShiftReport", ShiftReportSchema);
