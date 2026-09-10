/**
 * Migration: Add Performance Indexes
 *
 * Implements compound and multikey indexes for query performance optimization:
 * - shiftreports:
 *     - { groupId: 1, date: -1, startTime: -1 } (ESR compound index for report filtering)
 *     - { groupId: 1, date: -1, _id: -1 } (keyset cursor pagination index)
 * - vacationrequests:
 *     - { groupId: 1, status: 1, date: 1 } (accelerates pending/approved requests queries)
 *     - { groupId: 1, userId: 1, status: 1 } (accelerates user balance aggregations)
 *     - { groupId: 1, date: 1 }, { userId: 1, status: 1 }, { userId: 1, date: 1 } (backfilled)
 * - shiftschedules:
 *     - { groupId: 1, isPublished: 1, "shifts.userId": 1 } (multikey index for shift assignment lookup)
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
    // 1. ShiftReports Collection
    await ensureIndex(db, "shiftreports", { groupId: 1, date: -1, startTime: -1 });
    await ensureIndex(db, "shiftreports", { groupId: 1, date: -1, _id: -1 });

    // 2. VacationRequests Collection
    await ensureIndex(db, "vacationrequests", { groupId: 1, status: 1, date: 1 });
    await ensureIndex(db, "vacationrequests", { groupId: 1, userId: 1, status: 1 });
    await ensureIndex(db, "vacationrequests", { groupId: 1, date: 1 });
    await ensureIndex(db, "vacationrequests", { userId: 1, status: 1 });
    await ensureIndex(db, "vacationrequests", { userId: 1, date: 1 });

    // 3. ShiftSchedules Collection (Multikey Index)
    await ensureIndex(db, "shiftschedules", {
        groupId: 1,
        isPublished: 1,
        "shifts.userId": 1,
    });
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    // Roll back created performance indexes
    await safeDropIndex(db, "shiftreports", { groupId: 1, date: -1, startTime: -1 });
    await safeDropIndex(db, "shiftreports", { groupId: 1, date: -1, _id: -1 });

    await safeDropIndex(db, "vacationrequests", { groupId: 1, status: 1, date: 1 });
    await safeDropIndex(db, "vacationrequests", { groupId: 1, userId: 1, status: 1 });

    await safeDropIndex(db, "shiftschedules", {
        groupId: 1,
        isPublished: 1,
        "shifts.userId": 1,
    });
}

export default { up, down };
