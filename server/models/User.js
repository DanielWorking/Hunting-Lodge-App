const mongoose = require("mongoose");

// תת-סכמה לחברות בקבוצה (כפי שהיה לך)
const GroupMembershipSchema = new mongoose.Schema(
    {
        groupId: { type: String, required: true },
        role: {
            type: String,
            enum: ["member", "shift_manager"],
            default: "member",
        },
        order: { type: Number, default: 0 }, // סדר מיון
    },
    { _id: false }
);

const userSchema = new mongoose.Schema(
    {
        // המזהה הראשי: יגיע מה-SSO (בדרך כלל האימייל או ה-Upn)
        username: { type: String, required: true, unique: true },

        // שדה חדש לאימייל - לרוב זהה ל-username ב-SSO אבל טוב שיש בנפרד
        email: { type: String, unique: true, sparse: true },

        isActive: { type: Boolean, default: true },
        vacationBalance: { type: Number, default: 0 },
        lastLogin: { type: String, default: "Never" },

        // שימוש בתת-סכמה
        groups: [GroupMembershipSchema],
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
