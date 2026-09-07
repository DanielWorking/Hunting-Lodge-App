/**
 * Migration: Backfill User Schema Defaults
 *
 * Ensures all existing user documents have proper schema defaults:
 * - vacationBalance: defaults to 18 if missing
 * - isActive: defaults to true if missing
 * - favoritePhones: defaults to empty array if missing
 */

import type { Db, MongoClient, Filter, UpdateFilter, ObjectId } from "mongodb";

export interface IUserMigrationDocument {
    _id?: ObjectId;
    username?: string;
    email?: string;
    vacationBalance?: number;
    isActive?: boolean;
    favoritePhones?: string[];
}

export async function up(db: Db, _client?: MongoClient): Promise<void> {
    const usersCollection = db.collection<IUserMigrationDocument>("users");

    const vacationFilter: Filter<IUserMigrationDocument> = { vacationBalance: { $exists: false } };
    const vacationUpdate: UpdateFilter<IUserMigrationDocument> = { $set: { vacationBalance: 18 } };
    await usersCollection.updateMany(vacationFilter, vacationUpdate);

    const activeFilter: Filter<IUserMigrationDocument> = { isActive: { $exists: false } };
    const activeUpdate: UpdateFilter<IUserMigrationDocument> = { $set: { isActive: true } };
    await usersCollection.updateMany(activeFilter, activeUpdate);

    const phonesFilter: Filter<IUserMigrationDocument> = { favoritePhones: { $exists: false } };
    const phonesUpdate: UpdateFilter<IUserMigrationDocument> = { $set: { favoritePhones: [] } };
    await usersCollection.updateMany(phonesFilter, phonesUpdate);
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    const usersCollection = db.collection<IUserMigrationDocument>("users");

    // Symmetrical rollback: unset backfilled defaults matching baseline defaults
    const vacationFilter: Filter<IUserMigrationDocument> = { vacationBalance: 18 };
    const vacationUpdate: UpdateFilter<IUserMigrationDocument> = { $unset: { vacationBalance: "" } };
    await usersCollection.updateMany(vacationFilter, vacationUpdate);

    const activeFilter: Filter<IUserMigrationDocument> = { isActive: true };
    const activeUpdate: UpdateFilter<IUserMigrationDocument> = { $unset: { isActive: "" } };
    await usersCollection.updateMany(activeFilter, activeUpdate);

    const phonesFilter: Filter<IUserMigrationDocument> = { favoritePhones: { $size: 0 } };
    const phonesUpdate: UpdateFilter<IUserMigrationDocument> = { $unset: { favoritePhones: "" } };
    await usersCollection.updateMany(phonesFilter, phonesUpdate);
}

export default { up, down };
