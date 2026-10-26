/**
 * @module AdminGroupFixture
 *
 * Test fixture for the administrators group. The server learns the group's id at startup through
 * ensureAdminGroup(); tests run that same bootstrap with the database call stubbed, so every
 * administrator check sees ADMIN_GROUP_ID as the administrators group.
 */

import mongoose from "mongoose";
import config from "../config";
import Group from "../models/Group";
import { ensureAdminGroup } from "../services/adminGroup";

/** The administrators group's id in tests. */
export const ADMIN_GROUP_ID = "65f0000000000000000000ad";

/**
 * Makes ensureAdminGroup() find the administrators group under `groupId`, as if it existed in the
 * database with that id, until the returned function is called.
 *
 * @returns Restores the original database call.
 */
export function stubAdminGroupInDb(groupId: string = ADMIN_GROUP_ID): () => void {
    const groupHolder = Group as unknown as Record<string, unknown>;
    const originalFindOneAndUpdate = groupHolder.findOneAndUpdate;
    groupHolder.findOneAndUpdate = async () => ({
        value: { _id: new mongoose.Types.ObjectId(groupId), name: config.superAdmin.groupName },
        lastErrorObject: { updatedExisting: true },
    });
    return () => {
        groupHolder.findOneAndUpdate = originalFindOneAndUpdate;
    };
}

/**
 * Registers ADMIN_GROUP_ID as the administrators group (use as a `before` hook).
 */
export async function registerAdminGroup(): Promise<void> {
    const restore = stubAdminGroupInDb();
    try {
        await ensureAdminGroup();
    } finally {
        restore();
    }
}
