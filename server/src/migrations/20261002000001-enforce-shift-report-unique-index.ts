/**
 * Migration: Enforce Shift Report Unique Index
 *
 * Pre-cleans duplicate shift reports by groupId + title, safely drops the existing
 * non-unique index to avoid IndexOptionsConflict, and creates a unique compound index
 * on { groupId: 1, title: 1 } to guarantee idempotency across concurrent workers.
 */

import {
    Db,
    MongoClient,
    IndexSpecification,
    CreateIndexesOptions,
    MongoServerError,
} from "mongodb";

/**
 * Safely creates a unique index without swallowing option conflicts.
 * Allows reruns if identical index already exists, but surfaces option/spec conflicts.
 */
async function createUniqueIndex(
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
            (err.codeName === "IndexAlreadyExists" ||
                (typeof err.message === "string" &&
                    err.message.includes("identical to an existing index")))
        ) {
            return;
        }
        throw err;
    }
}

/**
 * Safely creates an index, ignoring conflicts if already created.
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
 * Safely drops an index if it exists, ignoring IndexNotFound.
 */
async function safeDropIndex(
    db: Db,
    collectionName: string,
    indexSpecOrName: string | IndexSpecification
): Promise<void> {
    try {
        await db.collection(collectionName).dropIndex(indexSpecOrName as unknown as string);
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
    const collection = db.collection("shiftreports");

    // a) Pre-index deduplication:
    // Aggregate shiftreports by { groupId: "$groupId", title: "$title" } having count > 1,
    // sort/retain primary, and remove duplicate entries.
    const duplicates = await collection
        .aggregate<{
            _id: { groupId: unknown; title: string };
            ids: unknown[];
            count: number;
        }>([
            {
                $sort: { createdAt: 1, _id: 1 },
            },
            {
                $group: {
                    _id: { groupId: "$groupId", title: "$title" },
                    ids: { $push: "$_id" },
                    count: { $sum: 1 },
                },
            },
            {
                $match: {
                    count: { $gt: 1 },
                },
            },
        ])
        .toArray();

    const idsToDelete: unknown[] = [];
    for (const dup of duplicates) {
        if (Array.isArray(dup.ids) && dup.ids.length > 1) {
            // Retain primary (first id), mark the rest for removal
            idsToDelete.push(...dup.ids.slice(1));
        }
    }

    if (idsToDelete.length > 0) {
        await collection.deleteMany({ _id: { $in: idsToDelete } });
    }

    // b) Safely drop old non-unique index to avoid IndexOptionsConflict
    // 1. Inspect existing collection indexes if available and drop any non-unique matching index
    try {
        if (typeof collection.indexes === "function") {
            const existingIndexes = (await collection.indexes()) as Array<{
                name: string;
                key: Record<string, unknown>;
                unique?: boolean;
            }>;
            for (const idx of existingIndexes) {
                const keys = idx?.key || {};
                const isMatchingSpec =
                    Object.keys(keys).length === 2 && keys.groupId === 1 && keys.title === 1;
                if (isMatchingSpec && !idx.unique) {
                    await collection.dropIndex(idx.name);
                }
            }
        }
    } catch {
        // Fall back to dropping by default index name
    }
    await safeDropIndex(db, "shiftreports", "groupId_1_title_1");

    // c) Create unique compound index { groupId: 1, title: 1 } with { unique: true, name: "groupId_1_title_1" }
    await createUniqueIndex(
        db,
        "shiftreports",
        { groupId: 1, title: 1 },
        { unique: true, name: "groupId_1_title_1" }
    );
}

export async function down(db: Db, _client?: MongoClient): Promise<void> {
    // a) Drop unique index groupId_1_title_1
    await safeDropIndex(db, "shiftreports", "groupId_1_title_1");

    // b) Re-create non-unique index { groupId: 1, title: 1 }
    await ensureIndex(db, "shiftreports", { groupId: 1, title: 1 });
}

export default { up, down };
