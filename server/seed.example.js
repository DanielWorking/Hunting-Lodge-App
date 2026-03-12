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

// זיהוי מצב העבודה (מקומי מול ארגוני)
const AUTH_MODE = process.env.SSO_IDENTIFIER_FIELD;
console.log(`⚙️  Seeding in Auth Mode: ${AUTH_MODE}`);

const adminUserData = {
    username: process.env.SUPER_ADMIN_ID,
    displayName: process.env.SUPER_ADMIN_USERNAME,
    email: process.env.SUPER_ADMIN_EMAIL,
};

const regularUserData = {
    username: "10002",
    displayName: "Regular User",
    email: "regular@corp.local",
};

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
    { name: "משמרת ערב", startTime: "14:00", endTime: "19:30" },
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
    },
    {
        name: "HQ",
        numbers: ["03-1234567"],
        type: "Landline",
        description: "Main Office",
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

        // 1. יצירת קבוצות
        const createdGroups = await Group.insertMany([
            {
                id: process.env.SUPER_ADMIN_GROUP_NAME,
                name: process.env.SUPER_ADMIN_GROUP_NAME,
                settings: { shiftTypes: [], timeSlots: [] },
                siteTags: ["General"],
            },
            {
                id: "noc",
                name: "noc",
                settings: {
                    shiftTypes: NOC_SHIFT_TYPES,
                    timeSlots: NOC_TIME_SLOTS,
                },
                siteTags: ["General", "Tacti"],
            },
        ]);

        // מיפוי חכם: יצירת מחרוזת מזהה (למשתמשים) ואובייקט מזהה (לאתרים) מתוך ה-_id האמיתי של מונגו
        const gMap = {};
        createdGroups.forEach((g) => {
            gMap[g.name] = {
                objectId: g._id,
                stringId: g._id.toString(),
            };
        });
        console.log("🏢 Groups Created...");

        // 2. יצירת טלפונים ראשית
        const createdPhones = await Phone.insertMany(phones);
        console.log("📞 Phones Created...");

        // 3. יצירת משתמשים
        const users = [
            {
                ...adminUserData,
                isActive: true,
                vacationBalance: 999,
                groups: [
                    {
                        groupId:
                            gMap[process.env.SUPER_ADMIN_GROUP_NAME].stringId,
                        role: "shift_manager",
                        order: 0,
                    },
                    {
                        groupId: gMap["noc"].stringId,
                        role: "shift_manager",
                        order: 1,
                    },
                ],
                favoritePhones: [createdPhones[0]._id],
                lastLogin: "Never",
            },
            {
                ...regularUserData,
                isActive: true,
                vacationBalance: 12,
                groups: [
                    { groupId: gMap["noc"].stringId, role: "member", order: 0 },
                ],
                favoritePhones: [],
                lastLogin: "Never",
            },
        ];

        await User.insertMany(users);
        console.log(`👤 Users Created (Admin: ${adminUserData.username})...`);

        // 4. יצירת אתרים
        const sites = [
            {
                title: "NOC Dashboard",
                url: "https://noc.example.com",
                imageUrl:
                    "https://via.placeholder.com/300/0000FF/808080?text=Dashboard",
                description: "Main monitoring dashboard",
                groupId: gMap["noc"].objectId,
                tag: "General",
                favoritedBy: [],
            },
            {
                title: "Shift Log Tool",
                url: "https://docs.google.com",
                imageUrl:
                    "https://via.placeholder.com/300/FF0000/FFFFFF?text=Logs",
                description: "Daily logs",
                groupId: gMap["noc"].objectId,
                tag: "General",
                favoritedBy: [],
            },
            {
                title: "Company Portal",
                url: "https://portal.company.com",
                imageUrl:
                    "https://via.placeholder.com/300/FFFF00/000000?text=Portal",
                description: "General company info",
                groupId: gMap["noc"].objectId,
                tag: "General",
                favoritedBy: [],
            },
        ];
        await Site.insertMany(sites);
        console.log("🌐 Sites Created...");

        console.log("✨ DATA IMPORTED SUCCESSFULLY!");
        process.exit();
    } catch (error) {
        console.error(`❌ Error: ${error}`);
        process.exit(1);
    }
};

importData();
