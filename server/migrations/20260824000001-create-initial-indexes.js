/**
 * Migration: Create Initial Indexes
 *
 * Ensures essential unique and lookup indexes exist across collections:
 * - users: unique username, unique sparse email
 * - groups: unique id
 * - shiftschedules: unique compound (groupId + startDate)
 * - sites: index on groupId, tag
 * - shiftreports: compound index on (groupId + date desc)
 * - phones: index on type
 */

/**
 * Helper to safely create an index even if a similar index spec exists under a different name.
 *
 * @param {import("mongodb").Db} db
 * @param {string} collectionName
 * @param {object} keys
 * @param {object} options
 */
async function ensureIndex(db, collectionName, keys, options = {}) {
    try {
        await db.collection(collectionName).createIndex(keys, options);
    } catch (err) {
        if (
            err.codeName === "IndexKeySpecsConflict" ||
            err.codeName === "IndexOptionsConflict" ||
            (err.message && err.message.includes("already exists with a different name"))
        ) {
            console.log(`  [Index Info] Index on ${collectionName} for ${JSON.stringify(keys)} already exists.`);
        } else {
            throw err;
        }
    }
}

module.exports = {
    async up(db) {
        // Users collection
        await ensureIndex(db, "users", { username: 1 }, { unique: true });
        await ensureIndex(db, "users", { email: 1 }, { unique: true, sparse: true });

        // Groups collection
        await ensureIndex(db, "groups", { name: 1 }, { unique: true });

        // ShiftSchedules collection
        await ensureIndex(db, "shiftschedules", { groupId: 1, startDate: 1 }, { unique: true });

        // Sites collection
        await ensureIndex(db, "sites", { groupId: 1 });
        await ensureIndex(db, "sites", { tag: 1 });

        // ShiftReports collection
        await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });

        // Phones collection
        await ensureIndex(db, "phones", { type: 1 });
    },

    async down(db) {
        const safeDropIndex = async (collectionName, keys) => {
            try {
                await db.collection(collectionName).dropIndex(keys);
            } catch (err) {
                // Ignore if index does not exist during rollback
            }
        };

        await safeDropIndex("users", { username: 1 });
        await safeDropIndex("users", { email: 1 });
        await safeDropIndex("groups", { name: 1 });
        await safeDropIndex("shiftschedules", { groupId: 1, startDate: 1 });
        await safeDropIndex("sites", { groupId: 1 });
        await safeDropIndex("sites", { tag: 1 });
        await safeDropIndex("shiftreports", { groupId: 1, date: -1 });
        await safeDropIndex("phones", { type: 1 });
    },
};
