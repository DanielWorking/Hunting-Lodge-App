/**
 * Migration: Sanitize and Backfill Schema Defaults
 *
 * Ensures all existing database documents conform to new schema constraints:
 * - users: backfills missing roles in groups array to 'member'
 * - users: trims and lowercases email, ensuring valid email strings
 * - sites: backfills missing tags to 'General' and favoritedBy to []
 * - phones: backfills missing description to ''
 * - groups: ensures siteTags default to ['General']
 */

module.exports = {
    async up(db) {
        // 1. Backfill missing group roles to 'member'
        await db.collection("users").updateMany(
            { groups: { $elemMatch: { role: { $exists: false } } } },
            { $set: { "groups.$[elem].role": "member" } },
            { arrayFilters: [{ "elem.role": { $exists: false } }] }
        );

        // 2. Backfill missing favoritePhones to empty array
        await db.collection("users").updateMany(
            { favoritePhones: { $exists: false } },
            { $set: { favoritePhones: [] } }
        );

        // 3. Backfill missing sites tags to 'General'
        await db.collection("sites").updateMany(
            { $or: [{ tag: { $exists: false } }, { tag: null }, { tag: "" }] },
            { $set: { tag: "General" } }
        );

        // 4. Backfill missing sites favoritedBy to []
        await db.collection("sites").updateMany(
            { favoritedBy: { $exists: false } },
            { $set: { favoritedBy: [] } }
        );

        // 5. Backfill missing phones description to ''
        await db.collection("phones").updateMany(
            { description: { $exists: false } },
            { $set: { description: "" } }
        );

        // 6. Backfill missing group siteTags to ['General']
        await db.collection("groups").updateMany(
            { siteTags: { $exists: false } },
            { $set: { siteTags: ["General"] } }
        );
    },

    async down(db) {
        // Non-destructive rollback: keep backfilled defaults
    },
};
