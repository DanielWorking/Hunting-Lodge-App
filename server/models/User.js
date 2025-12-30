const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        // שם מלא מה-SSO
        name: {
            type: String,
            required: true,
        },
        // המייל הוא המזהה הראשי שלנו
        email: {
            type: String,
            required: true,
            unique: true,
        },
        // מזהה ייחודי שמגיע מה-SSO (למשל sub) - אופציונלי אך מומלץ לשמור
        ssoId: {
            type: String,
            unique: true,
            sparse: true, // מאפשר שיהיו משתמשים בלי שדה זה (אם יש משתמשים ישנים)
        },
        // סיסמה - כבר לא חובה (required: false)
        password: {
            type: String,
            required: false,
        },
        // תפקיד המשתמש - ברירת מחדל היא 'guest' עד שאדמין יאשר
        role: {
            type: String,
            enum: ["guest", "user", "admin"],
            default: "guest",
        },
        // שיוך לקבוצה (כמו שהיה לך)
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            default: null,
        },
        phoneNumber: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
