/**
 * Migration: Create Initial Indexes
 *
 * Ensures essential unique and lookup indexes exist across collections:
 * - users: unique username, unique sparse email
 * - groups: unique name
 * - shiftschedules: unique compound (groupId + startDate)
 * - sites: index on groupId, tag
 * - shiftreports: compound index on (groupId + date desc)
 * - phones: index on type
 */

import {
    Db,
    MongoClient,
    IndexSpecification,
    CreateIndexesOptions,
    MongoServerError,
} from "mongodb";

/**
 * Safely creates an index even if a similar spec or name conflict exists.
 */
async function ensureIndex(
    db: Db,
    collectionName: string,
    keys: IndexSpecification,
    options: CreateIndexesOptions = {}
): Promise<void> {
    try {
        await db.collection(collectionName).createIndex(keys, options);
    } catch (err: unknown) {
        if (
            err instanceof MongoServerError &&
            (err.codeName === "IndexKeySpecsConflict" ||
                err.codeName === "IndexOptionsConflict" ||
                err.code === 85 ||
                err.code === 86 ||
                (typeof err.message === "string" &&
                    err.message.includes("already exists with a different name")))
        ) {
            return;
        }
        if (
            err instanceof Error &&
            err.message.includes("already exists with a different name")
        ) {
            return;
        }
        throw err;
    }
}

/**
 * Safely drops an index, ignoring IndexNotFound while surfacing connection/operational errors.
 */
async function safeDropIndex(
    db: Db,
    collectionName: string,
    keys: IndexSpecification
): Promise<void> {
    try {
        await db.collection(collectionName).dropIndex(keys as unknown as string);
    } catch (err: unknown) {
        if (
            err instanceof MongoServerError &&
            (err.code === 27 || err.codeName === "IndexNotFound")
        ) {
            return;
        }
        if (err instanceof Error && err.message.includes("index not found")) {
            return;
        }
        throw err;
    }
}

export async function up(db: Db, _client?: MongoClient): Promise<void> {
    // Users collection
    await ensureIndex(db, "users", { username: 1 }, { unique: true });
    await ensureIndex(db, "users", { email: 1 }, { unique: true, sparse: true });

    // Groups collection
    await ensureIndex(db, "groups", { name: 1 }, { unique: true });

    // ShiftSchedules collection
    await ensureIndex(db, "shiftschedules", { groupId: 1, startDate: 1 }, { unique: true });

    // Sites collection
    await ensureIndex(db, "sites", { groupId: 1 });
    await ensureIndex(db, "sites", { tag: 1 });

    // ShiftReports collection
    await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });

    // Phones collection
    await ensureIndex(db, "phones", { type: 1 });
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    await safeDropIndex(db, "users", { username: 1 });
    await safeDropIndex(db, "users", { email: 1 });
    await safeDropIndex(db, "groups", { name: 1 });
    await safeDropIndex(db, "shiftschedules", { groupId: 1, startDate: 1 });
    await safeDropIndex(db, "sites", { groupId: 1 });
    await safeDropIndex(db, "sites", { tag: 1 });
    await safeDropIndex(db, "shiftreports", { groupId: 1, date: -1 });
    await safeDropIndex(db, "phones", { type: 1 });
}

export default { up, down };
