/**
 * @module AdminGroup
 *
 * The administrators group (SUPER_ADMIN_GROUP_NAME) must exist for the app to be usable: the
 * Super Admin is added to it at first login, and from there grants everyone else access by adding
 * them to groups. The server creates it at startup and the seed script before seeding, so every
 * environment has it without any manual step. Its id is kept in memory from then on, so every
 * administrator and system-group check compares group ids, never names.
 */

import config from "../config";
import Group from "../models/Group";

let adminGroupId: string | undefined;

/**
 * The administrators group's id, or undefined until ensureAdminGroup() has run.
 */
export function getAdminGroupId(): string | undefined {
    return adminGroupId;
}

/**
 * True if `groupId` (an ObjectId or its string) is the administrators group. Always false until
 * ensureAdminGroup() has run, so a missing bootstrap can never grant administrator rights.
 */
export function isAdminGroup(groupId: unknown): boolean {
    return adminGroupId !== undefined && groupId != null && String(groupId) === adminGroupId;
}

/**
 * Creates the administrators group if it does not exist yet (an existing group is left as it is)
 * and remembers its id. Safe to run on every start and from several replicas at once.
 *
 * @returns True if this call created the group.
 */
export async function ensureAdminGroup(): Promise<boolean> {
    const filter = { name: config.superAdmin.groupName };
    try {
        const result = await Group.findOneAndUpdate(
            filter,
            { $setOnInsert: { members: [], settings: { shiftTypes: [], timeSlots: [] }, siteTags: ["General"] } },
            { upsert: true, returnDocument: "after", includeResultMetadata: true },
        );
        if (!result.value) {
            throw new Error(`The administrators group "${config.superAdmin.groupName}" could not be created`);
        }
        adminGroupId = String(result.value._id);
        return result.lastErrorObject?.updatedExisting === false;
    } catch (err: unknown) {
        // Another replica created it at the same moment; the unique index on name refused this copy
        if ((err as { code?: number } | null)?.code === 11000) {
            const existing = await Group.findOne(filter);
            if (existing) {
                adminGroupId = String(existing._id);
                return false;
            }
        }
        throw err;
    }
}
