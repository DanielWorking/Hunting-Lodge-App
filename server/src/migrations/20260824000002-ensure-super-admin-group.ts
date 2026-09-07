/**
 * Migration: Ensure Super Admin Group
 *
 * Idempotently verifies and creates the default Super Admin group record
 * in the database if it doesn't already exist.
 */

import type { Db, MongoClient, Filter, ObjectId } from "mongodb";

export interface IGroupMigrationDocument {
    _id?: ObjectId;
    name: string;
    members: unknown[];
    settings?: {
        shiftTypes?: unknown[];
        timeSlots?: unknown[];
    };
    siteTags?: string[];
    createdAt?: Date;
}

export async function up(db: Db, _client?: MongoClient): Promise<void> {
    const adminGroupName: string = process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS";
    const groupsCollection = db.collection<IGroupMigrationDocument>("groups");

    const existingGroup = await groupsCollection.findOne({ name: adminGroupName });
    if (!existingGroup) {
        await groupsCollection.insertOne({
            name: adminGroupName,
            members: [],
            settings: {
                shiftTypes: [],
                timeSlots: [],
            },
            siteTags: ["General"],
            createdAt: new Date(),
        });
    }
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    const adminGroupName: string = process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS";
    const groupsCollection = db.collection<IGroupMigrationDocument>("groups");

    // Symmetrical rollback: only remove baseline group if 0 members are assigned to prevent data loss
    const filter: Filter<IGroupMigrationDocument> = {
        name: adminGroupName,
        members: { $size: 0 },
    };
    await groupsCollection.deleteOne(filter);
}

export default { up, down };
