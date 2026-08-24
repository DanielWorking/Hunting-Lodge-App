/**
 * Migration: Ensure Super Admin Group
 *
 * Idempotently verifies and creates the default Super Admin group record
 * in the database if it doesn't already exist.
 */

module.exports = {
    async up(db) {
        const adminGroupName = process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS";

        const existingGroup = await db.collection("groups").findOne({ name: adminGroupName });
        if (!existingGroup) {
            await db.collection("groups").insertOne({
                name: adminGroupName,
                members: [],
                settings: {
                    shiftTypes: [],
                    timeSlots: [],
                },
                reportEmails: [],
                siteTags: ["General"],
                createdAt: new Date(),
            });
            console.log(`  [Migration] Created baseline admin group: ${adminGroupName}`);
        }
    },

    async down(db) {
        const adminGroupName = process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS";
        // Only remove if group exists and has 0 members to prevent data loss
        await db.collection("groups").deleteOne({
            name: adminGroupName,
            members: { $size: 0 },
        });
    },
};
