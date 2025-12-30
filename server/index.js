const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

// === תיקון קריטי: טעינת משתני סביבה ראשונה ===
// חובה לטעון את ה-.env לפני כל ייבוא אחר שמשתמש בו
const result = dotenv.config();
if (result.error) {
    console.log("❌ Error loading .env file", result.error);
}

const mongoose = require("mongoose");
const cookieSession = require("cookie-session"); // ספרייה לניהול Session

// רק עכשיו, אחרי שה-env טעון, אפשר לייבא את הנתיבים
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 5000;

// === Middleware ===

app.use(
    cors({
        // בסביבת ייצור (Production) - הכתובת תגיע מהדפדפן באותו הדומיין
        // בסביבת פיתוח - חייבים לאשר את הכתובת של ה-React
        origin:
            process.env.NODE_ENV === "production"
                ? false
                : "http://localhost:5173",
        credentials: true, // מאפשר העברת עוגיות בין הקליינט לשרת
    })
);

app.use(express.json());

// הגדרת ניהול Session (עוגיות)
app.use(
    cookieSession({
        name: "session",
        keys: [process.env.COOKIE_SECRET || "secret_fallback_key"], // מפתח להצפנת העוגייה
        maxAge: 24 * 60 * 60 * 1000, // תוקף ל-24 שעות
    })
);

// חיבור ל-DB
const connectDB = async () => {
    try {
        // שימוש במשתנה סביבה או בברירת מחדל אם הוא חסר
        const uri =
            process.env.MONGO_URI || "mongodb://localhost:27017/hunting_lodge";
        const conn = await mongoose.connect(uri);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

connectDB();

// === הגדרת הנתיבים (Routes) ===

// נתיבי אימות (SSO)
app.use("/api/auth", authRoutes);

// שאר הנתיבים הקיימים
app.use("/api/sites", require("./routes/sites"));
app.use("/api/phones", require("./routes/phones"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/users", require("./routes/users"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/reports", require("./routes/reports"));

// נתיב בדיקה כללי
app.get("/", (req, res) => {
    res.send("API is running...");
});

// הפעלת השרת
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
