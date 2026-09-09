/**
 * @module SeedExample
 *
 * Example database seeding script for local development and initial environment bootstrap.
 * Resets existing collections and populates structured sample data including
 * administrative & operational groups, users, shift types, time slots,
 * directory contacts, sites, shift schedules, and shift reports.
 */

import mongoose, { Types } from "mongoose";
import config from "./src/config";
import Group from "./src/models/Group";
import User from "./src/models/User";
import Site from "./src/models/Site";
import Phone from "./src/models/Phone";
import ShiftSchedule from "./src/models/ShiftSchedule";
import ShiftReport from "./src/models/ShiftReport";

// Safety guard to prevent accidental database wipes in production
if (config.isProd && !process.argv.includes("--force-production")) {
    console.error("\n==================================================================");
    console.error("⛔ PRODUCTION SAFETY TRIGGERED: SEEDING BLOCKED IN PRODUCTION MODE");
    console.error("==================================================================");
    console.error("This script executes deleteMany() and wipes all database records!");
    console.error("If you truly intend to wipe and re-seed the production database, run:");
    console.error("  node seed.example.js --force-production\n");
    console.error("==================================================================\n");
    process.exit(1);
}

// Operational mode detection (Local email vs. Organizational card/AD username)
const AUTH_MODE: string = config.sso.identifierField;
console.log(`⚙️  Seeding in Auth Mode: ${AUTH_MODE} [Environment: ${config.env}]`);

interface SeedUserIdentity {
    readonly username: string;
    readonly displayName: string;
    readonly email: string;
}

/** Predefined administrative user data derived from server configuration. */
const adminUserData: SeedUserIdentity = {
    username: config.superAdmin.id,
    displayName: config.superAdmin.username,
    email: config.superAdmin.email || "admin@corp.local",
};

/** Predefined regular user data for standard permission testing. */
const regularUserData: SeedUserIdentity = {
    username: "10002",
    displayName: "Regular User",
    email: "regular@corp.local",
};

// 1. Generate ObjectIds for Shift Types so Time Slots can link directly to them
const shiftTypeMorningId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeEveningId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeNightId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeAfterId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeMiddleId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeWeekendId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeVacationId: Types.ObjectId = new mongoose.Types.ObjectId();
const shiftTypeLeaveId: Types.ObjectId = new mongoose.Types.ObjectId();

interface ShiftTypeSeed {
    readonly _id: Types.ObjectId;
    readonly name: string;
    readonly color: string;
    readonly isVacation: boolean;
}

/** NOC shift types with unique ObjectIds, colors, and vacation flags. */
const NOC_SHIFT_TYPES: readonly ShiftTypeSeed[] = [
    { _id: shiftTypeMorningId, name: "Morning", color: "#476db5", isVacation: false },
    { _id: shiftTypeEveningId, name: "Evening", color: "#a32e9d", isVacation: false },
    { _id: shiftTypeNightId, name: "Night", color: "#2f3436", isVacation: false },
    { _id: shiftTypeAfterId, name: "After", color: "#bac4c8", isVacation: false },
    { _id: shiftTypeMiddleId, name: "Middle", color: "#2c728e", isVacation: false },
    { _id: shiftTypeWeekendId, name: "Weekend", color: "#eee836", isVacation: false },
    { _id: shiftTypeVacationId, name: "Vacation", color: "#E57373", isVacation: true },
    { _id: shiftTypeLeaveId, name: "Leave", color: "#9d6262", isVacation: true },
];

interface TimeSlotSeed {
    readonly name: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly linkedShiftTypes: readonly Types.ObjectId[];
}

/** NOC time slots with linked shift types for report auto-population. */
const NOC_TIME_SLOTS: readonly TimeSlotSeed[] = [
    {
        name: "Morning Shift",
        startTime: "08:00",
        endTime: "14:00",
        linkedShiftTypes: [shiftTypeMorningId],
    },
    {
        name: "Evening Shift",
        startTime: "14:00",
        endTime: "19:30",
        linkedShiftTypes: [shiftTypeEveningId],
    },
    {
        name: "Night Shift",
        startTime: "19:30",
        endTime: "08:00",
        linkedShiftTypes: [shiftTypeNightId],
    },
    {
        name: "Weekend Shift",
        startTime: "08:00",
        endTime: "08:00",
        linkedShiftTypes: [shiftTypeWeekendId],
    },
    {
        name: "Middle Shift",
        startTime: "10:00",
        endTime: "16:00",
        linkedShiftTypes: [shiftTypeMiddleId],
    },
];

interface PhoneSeed {
    readonly name: string;
    readonly numbers: readonly string[];
    readonly type: string;
    readonly description: string;
}

/** Phone directory records categorized by security/communication type. */
const phones: readonly PhoneSeed[] = [
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

interface WeekRange {
    readonly startOfWeekDate: Date;
    readonly endOfWeekDate: Date;
    readonly weekDays: readonly Date[];
}

/**
 * Calculates start and end timestamps for the current week (Sunday to Saturday).
 */
function getCurrentWeekRange(): WeekRange {
    const now: Date = new Date();
    const dayOfWeek: number = now.getDay(); // 0 is Sunday
    const startOfWeekDate: Date = new Date(now);
    startOfWeekDate.setDate(now.getDate() - dayOfWeek);
    startOfWeekDate.setHours(0, 0, 0, 0);

    const endOfWeekDate: Date = new Date(startOfWeekDate);
    endOfWeekDate.setDate(startOfWeekDate.getDate() + 6);
    endOfWeekDate.setHours(23, 59, 59, 999);

    const weekDays: Date[] = Array.from({ length: 7 }, (_, i: number): Date => {
        const d: Date = new Date(startOfWeekDate);
        d.setDate(startOfWeekDate.getDate() + i);
        return d;
    });

    return { startOfWeekDate, endOfWeekDate, weekDays };
}

/**
 * Main execution function to clear and seed all MongoDB collections with sample data.
 */
const importData = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongoUri, config.database ? config.database.options : {});
        console.log("✅ MongoDB Connected...");

        // Wipe existing collections
        await Group.deleteMany();
        await User.deleteMany();
        await Site.deleteMany();
        await Phone.deleteMany();
        await ShiftSchedule.deleteMany();
        await ShiftReport.deleteMany();
        console.log("🗑️  Old Data Destroyed...");

        // Ensure indexes match current schema (drops obsolete indexes like old 'id_1')
        try {
            await Group.syncIndexes();
            await User.syncIndexes();
            await Site.syncIndexes();
            await Phone.syncIndexes();
            await ShiftSchedule.syncIndexes();
            await ShiftReport.syncIndexes();
        } catch (idxErr: unknown) {
            const msg: string = idxErr instanceof Error ? idxErr.message : String(idxErr);
            console.log("  [Index sync notice]:", msg);
        }

        // 1. Create Groups
        const createdGroups = await Group.insertMany([
            {
                name: config.superAdmin.groupName,
                members: [],
                settings: { shiftTypes: [], timeSlots: [] },
                siteTags: ["General"],
            },
            {
                name: "noc",
                members: [],
                settings: {
                    shiftTypes: NOC_SHIFT_TYPES,
                    timeSlots: NOC_TIME_SLOTS,
                },
                siteTags: ["General", "Tacti"],
            },
        ]);

        // Map group names to their MongoDB generated ObjectIds
        const gMap: Record<string, Types.ObjectId> = {};
        createdGroups.forEach((g: { name: string; _id: Types.ObjectId }) => {
            gMap[g.name] = g._id;
        });
        console.log("🏢 Groups Created...");

        // 2. Create Phone Directory Entries
        const createdPhones = await Phone.insertMany(phones);
        console.log("📞 Phones Created...");

        // 3. Create Users
        const users = [
            {
                ...adminUserData,
                isActive: true,
                vacationBalance: 999,
                groups: [
                    {
                        groupId: gMap[config.superAdmin.groupName],
                        role: "shift_manager",
                        order: 0,
                    },
                    {
                        groupId: gMap["noc"],
                        role: "shift_manager",
                        order: 0,
                    },
                ],
                favoritePhones: [createdPhones[0]._id],
                lastLogin: new Date().toISOString(),
            },
            {
                ...regularUserData,
                isActive: true,
                vacationBalance: 18,
                groups: [
                    {
                        groupId: gMap["noc"],
                        role: "member",
                        order: 1,
                    },
                ],
                favoritePhones: [],
                lastLogin: new Date().toISOString(),
            },
        ];

        const createdUsers = await User.insertMany(users);
        console.log(`👤 Users Created (Admin: ${adminUserData.username}, Regular: ${regularUserData.username})...`);

        // Synchronize Group.members with created user ObjectIds
        await Group.updateOne(
            { _id: gMap[config.superAdmin.groupName] },
            { $set: { members: [createdUsers[0]._id] } }
        );
        await Group.updateOne(
            { _id: gMap["noc"] },
            { $set: { members: [createdUsers[0]._id, createdUsers[1]._id] } }
        );
        console.log("🔗 Group Members Synchronized...");

        // 4. Create Site Links
        const sites = [
            {
                title: "NOC Dashboard",
                url: "https://noc.example.com",
                imageUrl: "https://via.placeholder.com/300/0000FF/808080?text=Dashboard",
                description: "Main monitoring dashboard",
                groupId: gMap["noc"],
                tag: "General",
                favoritedBy: [createdUsers[0]._id],
            },
            {
                title: "Shift Log Tool",
                url: "https://docs.google.com",
                imageUrl: "https://via.placeholder.com/300/FF0000/FFFFFF?text=Logs",
                description: "Daily operational logs",
                groupId: gMap["noc"],
                tag: "Tacti",
                favoritedBy: [],
            },
            {
                title: "Company Portal",
                url: "https://portal.company.com",
                imageUrl: "https://via.placeholder.com/300/FFFF00/000000?text=Portal",
                description: "General company directory and tools",
                groupId: gMap["noc"],
                tag: "General",
                favoritedBy: [],
            },
        ];
        await Site.insertMany(sites);
        console.log("🌐 Sites Created...");

        // 5. Create Sample Shift Schedule for the Current Week
        const { startOfWeekDate, endOfWeekDate, weekDays } = getCurrentWeekRange();
        const sampleShifts = [
            // Sunday: Admin on Morning, Regular on Evening
            {
                userId: createdUsers[0]._id,
                date: weekDays[0],
                shiftTypeId: shiftTypeMorningId,
                vacationDeducted: false,
            },
            {
                userId: createdUsers[1]._id,
                date: weekDays[0],
                shiftTypeId: shiftTypeEveningId,
                vacationDeducted: false,
            },
            // Monday: Regular on Morning, Admin on Evening
            {
                userId: createdUsers[1]._id,
                date: weekDays[1],
                shiftTypeId: shiftTypeMorningId,
                vacationDeducted: false,
            },
            {
                userId: createdUsers[0]._id,
                date: weekDays[1],
                shiftTypeId: shiftTypeEveningId,
                vacationDeducted: false,
            },
            // Tuesday: Admin on Night, Regular on Middle
            {
                userId: createdUsers[0]._id,
                date: weekDays[2],
                shiftTypeId: shiftTypeNightId,
                vacationDeducted: false,
            },
            {
                userId: createdUsers[1]._id,
                date: weekDays[2],
                shiftTypeId: shiftTypeMiddleId,
                vacationDeducted: false,
            },
        ];

        await ShiftSchedule.create({
            groupId: gMap["noc"],
            startDate: startOfWeekDate,
            endDate: endOfWeekDate,
            isPublished: true,
            shifts: sampleShifts,
        });
        console.log("📅 Sample Published Shift Schedule Created...");

        // 6. Create Sample Shift Report
        const reportStartTime: Date = new Date();
        reportStartTime.setHours(8, 0, 0, 0);
        const reportEndTime: Date = new Date();
        reportEndTime.setHours(14, 0, 0, 0);

        await ShiftReport.create({
            groupId: gMap["noc"],
            title: `Morning Shift - ${reportStartTime.toLocaleDateString("en-US")}`,
            date: reportStartTime,
            startTime: reportStartTime.toISOString(),
            endTime: reportEndTime.toISOString(),
            previousTasks: "<p>Continued monitoring of core infrastructure and routine backups.</p>",
            currentTasks: "<p><strong>Shift Status:</strong> All systems operational without incident.</p><ul><li>Performed connectivity checks across all endpoints.</li><li>Scheduled server maintenance completed successfully.</li></ul>",
            attendees: [
                {
                    userId: createdUsers[0]._id,
                    name: createdUsers[0].username,
                    isManual: false,
                },
            ],
            isLocked: false,
        });
        console.log("📝 Sample Shift Report Created...");

        console.log("\n==================================================");
        console.log("✨ ALL SAMPLE DATA IMPORTED SUCCESSFULLY!");
        console.log("==================================================\n");
        process.exit(0);
    } catch (error: unknown) {
        const errorMsg: string = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error during seeding: ${errorMsg}`);
        process.exit(1);
    }
};

importData();