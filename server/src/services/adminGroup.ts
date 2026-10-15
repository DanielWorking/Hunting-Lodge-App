/**
 * @module AdminGroup
 *
 * The administrators group (SUPER_ADMIN_GROUP_NAME) must exist for the app to be usable: the
 * Super Admin is added to it at first login, and from there grants everyone else access by adding
 * them to groups. The server creates it at startup and the seed script before seeding, so every
 * environment has it without any manual step.
 */

import config from "../config";
import Group from "../models/Group";

/**
 * Creates the administrators group if it does not exist yet; an existing group is left as it is.
 * Safe to run on every start and from several replicas at once.
 *
 * @returns True if this call created the group.
 */
export async function ensureAdminGroup(): Promise<boolean> {
    try {
        const result = await Group.updateOne(
            { name: config.superAdmin.groupName },
            { $setOnInsert: { members: [], settings: { shiftTypes: [], timeSlots: [] }, siteTags: ["General"] } },
            { upsert: true },
        );
        return result.upsertedCount === 1;
    } catch (err: unknown) {
        // Another replica created it at the same moment; the unique index on name refused this copy
        if ((err as { code?: number } | null)?.code === 11000) {
            return false;
        }
        throw err;
    }
}
