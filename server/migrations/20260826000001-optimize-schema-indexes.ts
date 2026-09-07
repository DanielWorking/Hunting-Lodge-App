/**
 * Migration: Optimize Schema Indexes
 *
 * Creates essential compound and multikey indexes across collections without downtime:
 * - users: multikey index on groups.groupId, compound index on (groups.groupId + groups.order)
 * - phones: multikey index on numbers, index on name, compound index on (type + name)
 * - shiftreports: compound index on (groupId + startTime desc), compound index on (groupId + title)
 * - shiftschedules: compound query index on (groupId + isPublished + startDate + endDate)
 * - sites: compound index on (groupId + tag), compound index on (groupId + url)
 *
 * Safely cleans up deprecated single-field indexes that are superseded by compound ones.
 */

import {
    Db,
    MongoClient,
    IndexSpecification,
    CreateIndexesOptions,
    MongoServerError,
} from "mongodb";

/**
 * Safely creates an index even if a similar index spec exists under a different name.
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
 * Safely drops an index if it exists.
 */
async function safeDropIndex(
    db: Db,
    collectionName: string,
    indexSpec: IndexSpecification
): Promise<void> {
    try {
        await db.collection(collectionName).dropIndex(indexSpec as unknown as string);
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
    // 1. Users collection
    await ensureIndex(db, "users", { "groups.groupId": 1 });
    await ensureIndex(db, "users", { "groups.groupId": 1, "groups.order": 1 });

    // 2. Phones collection
    await ensureIndex(db, "phones", { numbers: 1 });
    await ensureIndex(db, "phones", { name: 1 });
    await ensureIndex(db, "phones", { type: 1, name: 1 });

    // 3. ShiftReports collection
    await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });
    await ensureIndex(db, "shiftreports", { groupId: 1, startTime: -1 });
    await ensureIndex(db, "shiftreports", { groupId: 1, title: 1 });

    // 4. ShiftSchedules collection
    await ensureIndex(db, "shiftschedules", {
        groupId: 1,
        isPublished: 1,
        startDate: 1,
        endDate: 1,
    });

    // 5. Sites collection
    await ensureIndex(db, "sites", { groupId: 1, tag: 1 });
    await ensureIndex(db, "sites", { groupId: 1, url: 1 });
    // Clean up un-scoped standalone tag index
    await safeDropIndex(db, "sites", { tag: 1 });
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    // Rollback created compound/multikey indexes
    await safeDropIndex(db, "users", { "groups.groupId": 1 });
    await safeDropIndex(db, "users", { "groups.groupId": 1, "groups.order": 1 });

    await safeDropIndex(db, "phones", { numbers: 1 });
    await safeDropIndex(db, "phones", { name: 1 });
    await safeDropIndex(db, "phones", { type: 1, name: 1 });

    await safeDropIndex(db, "shiftreports", { groupId: 1, startTime: -1 });
    await safeDropIndex(db, "shiftreports", { groupId: 1, title: 1 });
    await ensureIndex(db, "shiftreports", { groupId: 1, date: -1 });

    await safeDropIndex(db, "shiftschedules", {
        groupId: 1,
        isPublished: 1,
        startDate: 1,
        endDate: 1,
    });

    await safeDropIndex(db, "sites", { groupId: 1, tag: 1 });
    await safeDropIndex(db, "sites", { groupId: 1, url: 1 });
    // Restore dropped superseded index
    await ensureIndex(db, "sites", { tag: 1 });
}

export default { up, down };
