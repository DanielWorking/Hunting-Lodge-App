// const mongoose = require("mongoose");

// // הגדרה פנימית לשיוך לקבוצה (רק התפקיד הוא ייחודי לקבוצה)
// const GroupMembershipSchema = new mongoose.Schema(
//     {
//         groupId: { type: String, required: true },
//         role: {
//             type: String,
//             enum: ["member", "shift_manager"], // [cite: 9-10]
//             default: "member",
//         },
//         order: { type: Number, default: 0 }, // סדר מיון ברשימת החברים בקבוצה
//     },
//     { _id: false }
// );

// const UserSchema = new mongoose.Schema(
//     {
//         username: { type: String, required: true, unique: true },

//         // === שדות גלובליים ===
//         isActive: { type: Boolean, default: true }, // [cite: 13, 17] - האם המשתמש פעיל בחברה בכלל
//         vacationBalance: { type: Number, default: 18 }, // [cite: 28, 49] - יתרה שנתית גלובלית
//         lastLogin: { type: String, default: "Never" },

//         // === שיוך לקבוצות ותפקידים ===
//         groups: [GroupMembershipSchema],
//     },
//     {
//         timestamps: true,
//     }
// );

// module.exports = mongoose.model("User", UserSchema);

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
