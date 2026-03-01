const mongoose = require("mongoose");

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
