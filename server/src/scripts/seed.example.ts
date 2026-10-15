/**
 * @module SeedExample
 *
 * Example database seeding script for local development and initial environment bootstrap.
 * Copy it to seed.ts (git-ignored) and replace the sample data with your own.
 * Populates the operational groups (with their shift types and time slots), directory
 * contacts and sites, and makes sure the administrators group exists.
 *
 * It creates no users: everyone gets an account at their first SSO login. The Super Admin
 * (SUPER_ADMIN_* settings) is added to the administrators group then, and grants everyone
 * else access by adding them to groups on the Admin page.
 *
 * Without flags (nonprod only, or with --force-production) it first wipes every collection.
 * --idempotent never wipes: it seeds only when no group other than the administrators group
 * exists, and otherwise does nothing. The k8s seed Job runs it this way in every environment.
 */

import mongoose, { Types } from "mongoose";
import config from "../config";
import Group from "../models/Group";
import User from "../models/User";
import Site from "../models/Site";
import Phone from "../models/Phone";
import ShiftSchedule from "../models/ShiftSchedule";
import ShiftReport from "../models/ShiftReport";
import VacationRequest from "../models/VacationRequest";
import { ensureAdminGroup } from "../services/adminGroup";

// Check CLI flags
const isIdempotent: boolean = process.argv.includes("--idempotent");
const forceProduction: boolean = process.argv.includes("--force-production");

// Safety guard to prevent accidental database wipes in preprod and prod
if (!config.isNonProd && !forceProduction && !isIdempotent) {
    console.error("\n==================================================================");
    console.error("⛔ SAFETY TRIGGERED: SEEDING BLOCKED IN PREPROD/PROD MODE");
    console.error("==================================================================");
    console.error("This script executes deleteMany() and wipes all database records!");
    console.error("If you truly intend to wipe and re-seed the preprod/prod database, run:");
    console.error("  npm run seed -- --force-production\n");
    console.error("For safe, idempotent initial bootstrap in production/CI/CD, run:");
    console.error("  npm run seed -- --idempotent\n");
    console.error("==================================================================\n");
    process.exit(1);
}

console.log(`⚙️  Seeding [Environment: ${config.env}]`);

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

/**
 * Non-active shift type IDs (vacation / Vacation, after / After, not in country / Leave).
 * These shift types represent non-working periods and must NEVER be assigned to operational time slots.
 */
const NON_ACTIVE_SHIFT_TYPE_IDS: ReadonlySet<string> = new Set([
    shiftTypeVacationId.toString(),
    shiftTypeLeaveId.toString(),
    shiftTypeAfterId.toString(),
]);

/**
 * Validates that no non-active shift types are assigned to operational time slots.
 * @throws Error if any non-active shift type is assigned to a time slot.
 */
function validateSeedTimeSlots(
    timeSlots: readonly TimeSlotSeed[],
    nonActiveIds: ReadonlySet<string>
): void {
    for (const slot of timeSlots) {
        for (const linkedId of slot.linkedShiftTypes) {
            if (nonActiveIds.has(linkedId.toString())) {
                throw new Error(
                    `[Seed Validation Error] Non-active shift type (${linkedId.toString()}) cannot be assigned to time slot "${slot.name}".`
                );
            }
        }
    }
}

interface PhoneSeed {
    readonly name: string;
    readonly numbers: readonly string[];
    readonly type: "Black" | "Red" | "Mobile" | "Landline";
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

/**
 * Main execution function: wipes the collections (unless --idempotent) and seeds them.
 * When --idempotent is supplied, does nothing if the database is already seeded.
 */
const importData = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongoUri, config.database ? config.database.options : {});
        console.log("✅ MongoDB Connected...");

        if (isIdempotent) {
            console.log("🔍 Checking whether the database is already seeded (--idempotent)...");
            // The server creates the administrators group itself at startup, so only other groups count
            const seededGroup = await Group.exists({ name: { $ne: config.superAdmin.groupName } });
            if (seededGroup) {
                console.log("\n==================================================");
                console.log("ℹ️  IDEMPOTENT CHECK: Database already seeded!");
                console.log("   Skipping seed operations.");
                console.log("==================================================\n");
                await mongoose.disconnect();
                process.exit(0);
            }
            console.log("🌱 No seeded data found. Proceeding with initial seed...");
        } else {
            // Full reset: wipe existing collections in safe dependency order
            await VacationRequest.deleteMany({});
            await ShiftReport.deleteMany({});
            await ShiftSchedule.deleteMany({});
            await Site.deleteMany({});
            await Phone.deleteMany({});
            await User.deleteMany({});
            await Group.deleteMany({});
            console.log("🗑️  Old Data Destroyed across all collections...");
        }

        // Ensure indexes match current schema (drops obsolete indexes and applies compound indexes)
        try {
            await Group.syncIndexes();
            await User.syncIndexes();
            await Site.syncIndexes();
            await Phone.syncIndexes();
            await ShiftSchedule.syncIndexes();
            await ShiftReport.syncIndexes();
            await VacationRequest.syncIndexes();
            console.log("📐 Indexes Synchronized...");
        } catch (idxErr: unknown) {
            const msg: string = idxErr instanceof Error ? idxErr.message : String(idxErr);
            console.log("  [Index sync notice]:", msg);
        }

        // Validate that no non-active shift types (vacation, after, not in country / Leave) are linked to time slots
        validateSeedTimeSlots(NOC_TIME_SLOTS, NON_ACTIVE_SHIFT_TYPE_IDS);

        // 1. Create Groups (the administrators group as the server creates it at startup)
        await ensureAdminGroup();
        const createdGroups = await Group.insertMany([
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
        await Phone.insertMany(phones);
        console.log("📞 Phones Created...");

        // 3. Create Site Links
        const sites = [
            {
                title: "NOC Dashboard",
                url: "https://noc.example.com",
                imageUrl: "https://via.placeholder.com/300/0000FF/808080?text=Dashboard",
                description: "Main monitoring dashboard",
                groupId: gMap["noc"],
                tag: "General",
                favoritedBy: [],
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

        console.log("\n==================================================");
        console.log("✨ ALL SAMPLE DATA IMPORTED SUCCESSFULLY!");
        console.log("==================================================\n");
        await mongoose.disconnect();
        process.exit(0);
    } catch (error: unknown) {
        const errorMsg: string = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error during seeding: ${errorMsg}`);
        try {
            await mongoose.disconnect();
        } catch (discErr: unknown) {
            const discMsg: string = discErr instanceof Error ? discErr.message : String(discErr);
            console.warn(`⚠️ [Seed Job] Secondary disconnect error: ${discMsg}`);
        }
        process.exit(1);
    }
};

// Graceful signal handling for container termination (SIGTERM / SIGINT)
const handleShutdown = async (signal: string): Promise<void> => {
    console.log(`\n🛑 [Seed Job] ${signal} received. Closing database connection...`);
    try {
        await mongoose.disconnect();
        console.log("🔒 [Seed Job] MongoDB connection closed cleanly.");
    } catch (err: unknown) {
        console.error("❌ [Seed Job] Error during disconnect:", err);
    }
    process.exit(1);
};

process.on("SIGTERM", () => void handleShutdown("SIGTERM"));
process.on("SIGINT", () => void handleShutdown("SIGINT"));

importData().catch((fatalError: unknown) => {
    const errorMsg: string = fatalError instanceof Error ? fatalError.message : String(fatalError);
    console.error(`❌ Fatal unhandled error during seeding: ${errorMsg}`);
    void mongoose.disconnect().finally(() => process.exit(1));
});