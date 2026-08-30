/**
 * Migration: Optimize Schema Indexes
 *
 * Creates essential compound and multikey indexes across collections without downtime:
 * - users: multikey index on groups.groupId, compound index on (groups.groupId + groups.order)
 * - phones: multikey index on numbers, index on name, compound index on (type + name)
 * - shiftreports: compound index on (groupId + startTime desc), compound index on (groupId + title)
 * - shiftschedules: compound query index on (groupId + isPublished + startDate + endDate)
 * - sites: compound index on (groupId + tag), compound index on (groupId + url)
 *
 * Safely cleans up deprecated single-field indexes that are superseded by compound ones.
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

/**
 * Helper to safely drop an index if it exists.
 *
 * @param {import("mongodb").Db} db
 * @param {string} collectionName
 * @param {object|string} indexSpec
 */
async function safeDropIndex(db, collectionName, indexSpec) {
    try {
        await db.collection(collectionName).dropIndex(indexSpec);
    } catch (err) {
        // Ignore if index does not exist
    }
}

module.exports = {
    async up(db) {
        // 1. Users collection
        await ensureIndex(db, "users", { "groups.groupId": 1 });
        await ensureIndex(db, "users", { "groups.groupId": 1, "groups.order": 1 });

        // 2. Phones collection
        await ensureIndex(db, "phones", { numbers: 1 });
        await ensureIndex(db, "phones", { name: 1 });
        await ensureIndex(db, "phones", { type: 1, name: 1 });

        // 3. ShiftReports collection
        await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });
        await ensureIndex(db, "shiftreports", { groupId: 1, startTime: -1 });
        await ensureIndex(db, "shiftreports", { groupId: 1, title: 1 });

        // 4. ShiftSchedules collection
        await ensureIndex(db, "shiftschedules", {
            groupId: 1,
            isPublished: 1,
            startDate: 1,
            endDate: 1,
        });

        // 5. Sites collection
        await ensureIndex(db, "sites", { groupId: 1, tag: 1 });
        await ensureIndex(db, "sites", { groupId: 1, url: 1 });
        // Clean up un-scoped standalone tag index
        await safeDropIndex(db, "sites", { tag: 1 });
    },

    async down(db) {
        // Rollback indexes
        await safeDropIndex(db, "users", { "groups.groupId": 1 });
        await safeDropIndex(db, "users", { "groups.groupId": 1, "groups.order": 1 });

        await safeDropIndex(db, "phones", { numbers: 1 });
        await safeDropIndex(db, "phones", { name: 1 });
        await safeDropIndex(db, "phones", { type: 1, name: 1 });

        await safeDropIndex(db, "shiftreports", { groupId: 1, startTime: -1 });
        await safeDropIndex(db, "shiftreports", { groupId: 1, title: 1 });
        await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });

        await safeDropIndex(db, "shiftschedules", {
            groupId: 1,
            isPublished: 1,
            startDate: 1,
            endDate: 1,
        });

        await safeDropIndex(db, "sites", { groupId: 1, tag: 1 });
        await safeDropIndex(db, "sites", { groupId: 1, url: 1 });
        await ensureIndex(db, "sites", { tag: 1 });
    },
};
