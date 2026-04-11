/**
 * @module SeedExample
 * 
 * A utility script to seed the database with initial sample data.
 * This script clears all existing data and populates groups, users, sites, 
 * and phone records to provide a functional starting point for the application.
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load database models
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

// Detect operational mode (Local vs. Organizational) based on SSO configuration
const AUTH_MODE = process.env.SSO_IDENTIFIER_FIELD;
console.log(`⚙️  Seeding in Auth Mode: ${AUTH_MODE}`);

/** @type {Object} Predefined administrative user data pulled from environment variables. */
const adminUserData = {
    username: process.env.SUPER_ADMIN_ID,
    displayName: process.env.SUPER_ADMIN_USERNAME,
    email: process.env.SUPER_ADMIN_EMAIL,
};

/** @type {Object} Sample regular user for testing non-privileged access. */
const regularUserData = {
    username: "10002",
    displayName: "Regular User",
    email: "regular@corp.local",
};

/** @type {Array<Object>} Sample shift types for a NOC environment. */
const NOC_SHIFT_TYPES = [
    { name: "Morning", color: "#476db5", isVacation: false },
    { name: "Evening", color: "#a32e9d", isVacation: false },
    { name: "Night", color: "#2f3436", isVacation: false },
    { name: "After", color: "#bac4c8", isVacation: false },
    { name: "Middle", color: "#2c728e", isVacation: false },
    { name: "Saturday", color: "#eee836", isVacation: false },
    { name: "Vacation", color: "#E57373", isVacation: true },
    { name: "Leave", color: "#9d6262", isVacation: true },
];

/** @type {Array<Object>} Default time slots corresponding to NOC shift types. */
const NOC_TIME_SLOTS = [
    { name: "Morning Shift", startTime: "08:00", endTime: "14:00" },
    { name: "Evening Shift", startTime: "14:00", endTime: "19:30" },
    { name: "Night Shift", startTime: "19:30", endTime: "08:00" },
    { name: "After", startTime: "08:00", endTime: "08:00" },
    { name: "Saturday Shift", startTime: "08:00", endTime: "08:00" },
    { name: "Vacation", startTime: "08:00", endTime: "08:00" },
    { name: "Leave", startTime: "08:00", endTime: "08:00" },
    { name: "Middle Shift", startTime: "10:00", endTime: "16:00" },
];

/** @type {Array<Object>} Sample contact records for the phone directory. */
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

/**
 * Orchestrates the data import process.
 * 
 * Connects to MongoDB, wipes all existing collections, and inserts
 * fresh seed data in the correct dependency order.
 * 
 * @async
 * @function importData
 * @throws {Error} If connection or insertion fails.
 */
const importData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB Connected...");

        // Clear existing data to ensure a fresh start
        await Group.deleteMany();
        await User.deleteMany();
        await Site.deleteMany();
        await Phone.deleteMany();
        await ShiftSchedule.deleteMany();
        await ShiftReport.deleteMany();
        console.log("🗑️  Old Data Destroyed...");

        // 1. Create initial groups
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
                siteTags: ["General", "Tactical"],
            },
        ]);

        // Smart mapping: Create lookup for group IDs to simplify user and site associations
        const gMap = {};
        createdGroups.forEach((g) => {
            gMap[g.name] = {
                objectId: g._id,
                stringId: g._id.toString(),
            };
        });
        console.log("🏢 Groups Created...");

        // 2. Seed primary contact numbers
        const createdPhones = await Phone.insertMany(phones);
        console.log("📞 Phones Created...");

        // 3. Create initial users with predefined roles
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

        // 4. Seed group-specific resources and links
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

// Execute the seed process
importData();
