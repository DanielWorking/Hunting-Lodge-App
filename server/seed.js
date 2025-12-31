const mongoose = require("mongoose");
const dotenv = require("dotenv");

// טעינת המודלים
const Group = require("./models/Group");
const User = require("./models/User");
const Site = require("./models/Site");
const Phone = require("./models/Phone");
const ShiftSchedule = require("./models/ShiftSchedule");
const ShiftReport = require("./models/ShiftReport");

const result = dotenv.config();
if (result.error) {
    console.log("❌ Error loading .env file:", result.error);
    process.exit(1);
}

// === חשוב: הגדר כאן את המייל שלך ב-Auth0 / ארגון ===
// זה המשתמש שיקבל הרשאות ניהול בפעם הראשונה
// const INITIAL_ADMIN_EMAIL = "CHANGE_ME@gmail.com";
const INITIAL_ADMIN_EMAIL = "daniel.reifer17@gmail.com";
// ===================================================

const DEFAULT_SHIFT_TYPES = [
    { name: "Morning", color: "#FFB74D", isVacation: false },
    { name: "Evening", color: "#64B5F6", isVacation: false },
    { name: "Night", color: "#455A64", isVacation: false },
    { name: "Vacation", color: "#E57373", isVacation: true },
];

const DEFAULT_TIME_SLOTS = [
    { name: "Morning Shift", startTime: "07:00", endTime: "15:00" },
    { name: "Evening Shift", startTime: "15:00", endTime: "23:00" },
    { name: "Night Shift", startTime: "23:00", endTime: "07:00" },
];

const phones = [
    {
        name: "David",
        numbers: ["050-123-4567"],
        type: "Mobile",
        description: "NOC Manager",
        isFavorite: true,
    },
    {
        name: "HQ",
        numbers: ["03-1234567"],
        type: "Landline",
        description: "Main Office",
        isFavorite: false,
    },
];

const importData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected...");

        // ניקוי נתונים ישנים
        await Group.deleteMany();
        await User.deleteMany();
        await Site.deleteMany();
        await Phone.deleteMany();
        await ShiftSchedule.deleteMany();
        await ShiftReport.deleteMany();
        console.log("🗑️  Old Data Destroyed...");

        // יצירת קבוצות
        const createdGroups = await Group.insertMany([
            {
                name: "administrators",
                settings: { shiftTypes: [], timeSlots: [] },
            },
            {
                name: "splunk",
                settings: {
                    shiftTypes: DEFAULT_SHIFT_TYPES,
                    timeSlots: DEFAULT_TIME_SLOTS,
                },
            },
            {
                name: "noc",
                settings: {
                    shiftTypes: DEFAULT_SHIFT_TYPES,
                    timeSlots: DEFAULT_TIME_SLOTS,
                },
            },
            { name: "zooz", settings: { shiftTypes: [], timeSlots: [] } },
        ]);

        const gMap = {};
        createdGroups.forEach((g) => {
            gMap[g.name] = g._id;
        });
        console.log("🏢 Groups Created...");

        // יצירת משתמשים - שים לב לשינוי באדמין
        const users = [
            {
                // זה יהיה שם התצוגה במערכת, אבל המזהה האמיתי בחיבור יהיה האימייל
                username: "Super Admin",
                email: INITIAL_ADMIN_EMAIL, // <-- כאן נכנס המייל שלך
                isActive: true,
                vacationBalance: 999,
                groups: [
                    { groupId: gMap["administrators"], role: "shift_manager" },
                    { groupId: gMap["noc"], role: "shift_manager" },
                ],
                lastLogin: "Never",
            },
            // משתמשים נוספים לדוגמה (לא יצליחו להתחבר ב-SSO אלא אם יש להם מיילים אמיתיים בארגון)
            {
                username: "Regular User",
                email: "regular@example.com",
                isActive: true,
                vacationBalance: 12,
                groups: [{ groupId: gMap["noc"], role: "member" }],
            },
        ];

        await User.insertMany(users);
        console.log("busts_in_silhouette Users Created...");

        // יצירת טלפונים ואתרים (ללא שינוי)
        await Phone.insertMany(phones);

        const sites = [
            {
                title: "NOC Dashboard",
                url: "https://noc.example.com",
                imageUrl: "https://via.placeholder.com/300",
                description: "Monitor",
                isFavorite: true,
                groupId: gMap["noc"],
                isTacti: false,
            },
        ];
        await Site.insertMany(sites);

        console.log("✨ DATA IMPORTED SUCCESSFULLY!");
        process.exit();
    } catch (error) {
        console.error(`❌ Error: ${error}`);
        process.exit(1);
    }
};

importData();
