const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth"); //* new for sso integration

// טעינת משתני סביבה
const result = dotenv.config();
if (result.error) {
    console.log("❌ Error loading .env file", result.error);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// חיבור ל-DB
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

connectDB();

// === הגדרת הנתיבים (Routes) ===
app.use("/api/sites", require("./routes/sites"));
app.use("/api/phones", require("./routes/phones"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/users", require("./routes/users"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/reports", require("./routes/reports"));
// SSO Auth Routes
app.use("/api/auth", authRoutes);

// נתיב בדיקה כללי
app.get("/", (req, res) => {
    res.send("Hunting Lodge API is running...");
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
