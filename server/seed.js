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
const INITIAL_ADMIN_EMAIL = "###@gmail.com";
// ===================================================

const NOC_SHIFT_TYPES = [
    { name: "בוקר", color: "#476db5", isVacation: false },
    { name: "ערב", color: "#a32e9d", isVacation: false },
    { name: "לילה", color: "#2f3436", isVacation: false },
    { name: "אפטר", color: "#bac4c8", isVacation: false },
    { name: "אמצע", color: "#2c728e", isVacation: false },
    { name: "שבת", color: "#eee836", isVacation: false },
    { name: "חופש", color: "#E57373", isVacation: true },
    { name: "חול", color: "#9d6262", isVacation: true },
];

const NOC_TIME_SLOTS = [
    { name: "משמרת בוקר", startTime: "08:00", endTime: "14:00" },
    { name: "משמרת ערב", startTime: "15:00", endTime: "19:30" },
    { name: "משמרת לילה", startTime: "19:30", endTime: "08:00" },
    { name: "אפטר", startTime: "08:00", endTime: "08:00" },
    { name: "משמרת שבת", startTime: "08:00", endTime: "08:00" },
    { name: "חופש", startTime: "08:00", endTime: "08:00" },
    { name: "חול", startTime: "08:00", endTime: "08:00" },
    { name: "משמרת אמצע", startTime: "10:00", endTime: "16:00" },
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

        // 1. יצירת קבוצות עם הגדרת תגיות (siteTags)
        const createdGroups = await Group.insertMany([
            {
                id: "administrators",
                name: "administrators",
                settings: { shiftTypes: [], timeSlots: [] },
                siteTags: ["General"],
            },
            {
                id: "noc",
                name: "noc",
                settings: {
                    shiftTypes: DEFAULT_SHIFT_TYPES,
                    timeSlots: DEFAULT_TIME_SLOTS,
                },
                // הגדרת התגיות שהכרטיסים ישתמשו בהן
                siteTags: ["General", "Tacti"],
            },
        ]);

        const gMap = {};
        createdGroups.forEach((g) => {
            gMap[g.name] = g._id;
        });
        console.log("🏢 Groups Created...");

        // 2. יצירת משתמשים
        const users = [
            {
                username: "Super Admin",
                id: "auth0|superadmin",
                email: INITIAL_ADMIN_EMAIL,
                isActive: true,
                vacationBalance: 999,
                groups: [
                    { groupId: gMap["administrators"], role: "shift_manager" },
                    { groupId: gMap["noc"], role: "shift_manager" },
                ],
                lastLogin: "Never",
            },
            {
                username: "Regular User",
                id: "auth0|regular",
                email: "regular@example.com",
                isActive: true,
                vacationBalance: 12,
                groups: [{ groupId: gMap["noc"], role: "member" }],
            },
        ];

        await User.insertMany(users);
        console.log("👤 Users Created...");

        // 3. יצירת טלפונים
        await Phone.insertMany(phones);

        // 4. יצירת אתרים (ללא isTacti ועם תגיות תואמות לקבוצות)
        const sites = [
            {
                title: "NOC Dashboard",
                url: "https://noc.example.com",
                imageUrl:
                    "https://via.placeholder.com/300/0000FF/808080?text=Dashboard",
                description: "Main monitoring dashboard",
                isFavorite: true,
                groupId: gMap["noc"],
                tag: "General",
            },
            {
                title: "Shift Log Tool",
                url: "https://docs.google.com",
                imageUrl:
                    "https://via.placeholder.com/300/FF0000/FFFFFF?text=Logs",
                description: "Daily logs",
                isFavorite: false,
                groupId: gMap["noc"],
                tag: "General",
            },
            {
                title: "Company Portal",
                url: "https://portal.company.com",
                imageUrl:
                    "https://via.placeholder.com/300/FFFF00/000000?text=Portal",
                description: "General company info",
                isFavorite: false,
                groupId: gMap["noc"],
                tag: "General", // ברירת מחדל
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
