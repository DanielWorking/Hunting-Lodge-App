/**
 * Migration: Backfill User Schema Defaults
 *
 * Ensures all existing user documents have proper schema defaults:
 * - vacationBalance: defaults to 18 if missing
 * - isActive: defaults to true if missing
 * - favoritePhones: defaults to empty array if missing
 */

module.exports = {
    async up(db) {
        await db.collection("users").updateMany(
            { vacationBalance: { $exists: false } },
            { $set: { vacationBalance: 18 } }
        );

        await db.collection("users").updateMany(
            { isActive: { $exists: false } },
            { $set: { isActive: true } }
        );

        await db.collection("users").updateMany(
            { favoritePhones: { $exists: false } },
            { $set: { favoritePhones: [] } }
        );
    },

    async down(db) {
        // Non-destructive rollback: keep default values
    },
};
