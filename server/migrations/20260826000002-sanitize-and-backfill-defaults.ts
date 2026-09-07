/**
 * Migration: Sanitize and Backfill Schema Defaults
 *
 * Ensures all existing database documents conform to new schema constraints:
 * - users: backfills missing roles in groups array to 'member'
 * - sites: backfills missing tags to 'General' and favoritedBy to []
 * - phones: backfills missing description to ''
 * - groups: ensures siteTags default to ['General']
 */

import type { Db, MongoClient, ObjectId, Filter, UpdateFilter, UpdateOptions } from "mongodb";

export interface IUserMigrationGroup {
    groupId?: ObjectId | string;
    role?: string;
    order?: number;
}

export interface IUserMigrationDocument {
    _id?: ObjectId;
    username?: string;
    email?: string;
    groups?: IUserMigrationGroup[];
    favoritePhones?: string[];
}

export interface ISiteMigrationDocument {
    _id?: ObjectId;
    name?: string;
    url?: string;
    groupId?: ObjectId | string;
    tag?: string | null;
    favoritedBy?: (ObjectId | string)[];
}

export interface IPhoneMigrationDocument {
    _id?: ObjectId;
    name?: string;
    type?: string;
    numbers?: string[];
    description?: string;
}

export interface IGroupMigrationDocument {
    _id?: ObjectId;
    name?: string;
    members?: unknown[];
    siteTags?: string[];
}

export async function up(db: Db, _client?: MongoClient): Promise<void> {
    const usersCollection = db.collection<IUserMigrationDocument>("users");
    const sitesCollection = db.collection<ISiteMigrationDocument>("sites");
    const phonesCollection = db.collection<IPhoneMigrationDocument>("phones");
    const groupsCollection = db.collection<IGroupMigrationDocument>("groups");

    // 1. Backfill missing group roles to 'member'
    const userRoleFilter: Filter<IUserMigrationDocument> = {
        groups: { $elemMatch: { role: { $exists: false } } },
    };
    const userRoleUpdate: UpdateFilter<IUserMigrationDocument> = {
        $set: { "groups.$[elem].role": "member" },
    };
    const userRoleOptions: UpdateOptions = {
        arrayFilters: [{ "elem.role": { $exists: false } }],
    };
    await usersCollection.updateMany(userRoleFilter, userRoleUpdate, userRoleOptions);

    // 2. Backfill missing favoritePhones to empty array
    const userPhonesFilter: Filter<IUserMigrationDocument> = { favoritePhones: { $exists: false } };
    const userPhonesUpdate: UpdateFilter<IUserMigrationDocument> = { $set: { favoritePhones: [] } };
    await usersCollection.updateMany(userPhonesFilter, userPhonesUpdate);

    // 3. Backfill missing sites tags to 'General'
    const sitesTagFilter: Filter<ISiteMigrationDocument> = {
        $or: [{ tag: { $exists: false } }, { tag: null }, { tag: "" }],
    };
    const sitesTagUpdate: UpdateFilter<ISiteMigrationDocument> = { $set: { tag: "General" } };
    await sitesCollection.updateMany(sitesTagFilter, sitesTagUpdate);

    // 4. Backfill missing sites favoritedBy to []
    const sitesFavFilter: Filter<ISiteMigrationDocument> = { favoritedBy: { $exists: false } };
    const sitesFavUpdate: UpdateFilter<ISiteMigrationDocument> = { $set: { favoritedBy: [] } };
    await sitesCollection.updateMany(sitesFavFilter, sitesFavUpdate);

    // 5. Backfill missing phones description to ''
    const phonesDescFilter: Filter<IPhoneMigrationDocument> = { description: { $exists: false } };
    const phonesDescUpdate: UpdateFilter<IPhoneMigrationDocument> = { $set: { description: "" } };
    await phonesCollection.updateMany(phonesDescFilter, phonesDescUpdate);

    // 6. Backfill missing group siteTags to ['General']
    const groupsTagFilter: Filter<IGroupMigrationDocument> = { siteTags: { $exists: false } };
    const groupsTagUpdate: UpdateFilter<IGroupMigrationDocument> = { $set: { siteTags: ["General"] } };
    await groupsCollection.updateMany(groupsTagFilter, groupsTagUpdate);
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    const usersCollection = db.collection<IUserMigrationDocument>("users");
    const sitesCollection = db.collection<ISiteMigrationDocument>("sites");
    const phonesCollection = db.collection<IPhoneMigrationDocument>("phones");
    const groupsCollection = db.collection<IGroupMigrationDocument>("groups");

    // Symmetrical rollback for backfilled defaults:
    const userRoleFilter: Filter<IUserMigrationDocument> = { "groups.role": "member" };
    const userRoleUpdate: UpdateFilter<IUserMigrationDocument> = { $unset: { "groups.$[elem].role": "" } };
    const userRoleOptions: UpdateOptions = {
        arrayFilters: [{ "elem.role": "member" }],
    };
    await usersCollection.updateMany(userRoleFilter, userRoleUpdate, userRoleOptions);

    const userPhonesFilter: Filter<IUserMigrationDocument> = { favoritePhones: { $size: 0 } };
    const userPhonesUpdate: UpdateFilter<IUserMigrationDocument> = { $unset: { favoritePhones: "" } };
    await usersCollection.updateMany(userPhonesFilter, userPhonesUpdate);

    const sitesTagFilter: Filter<ISiteMigrationDocument> = { tag: "General" };
    const sitesTagUpdate: UpdateFilter<ISiteMigrationDocument> = { $unset: { tag: "" } };
    await sitesCollection.updateMany(sitesTagFilter, sitesTagUpdate);

    const sitesFavFilter: Filter<ISiteMigrationDocument> = { favoritedBy: { $size: 0 } };
    const sitesFavUpdate: UpdateFilter<ISiteMigrationDocument> = { $unset: { favoritedBy: "" } };
    await sitesCollection.updateMany(sitesFavFilter, sitesFavUpdate);

    const phonesDescFilter: Filter<IPhoneMigrationDocument> = { description: "" };
    const phonesDescUpdate: UpdateFilter<IPhoneMigrationDocument> = { $unset: { description: "" } };
    await phonesCollection.updateMany(phonesDescFilter, phonesDescUpdate);

    const groupsTagFilter: Filter<IGroupMigrationDocument> = { siteTags: ["General"] };
    const groupsTagUpdate: UpdateFilter<IGroupMigrationDocument> = { $unset: { siteTags: "" } };
    await groupsCollection.updateMany(groupsTagFilter, groupsTagUpdate);
}

export default { up, down };
