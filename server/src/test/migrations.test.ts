import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db, CreateIndexesOptions, IndexSpecification } from "mongodb";

import migration1 from "../migrations/20260826000001-optimize-schema-indexes";
import migration2 from "../migrations/20260826000002-sanitize-and-backfill-defaults";
import migration3 from "../migrations/20260824000001-create-initial-indexes";
import migration4 from "../migrations/20260824000002-ensure-super-admin-group";
import migration5 from "../migrations/20260824000003-backfill-user-defaults";

interface RecordedIndex {
    collection: string;
    keys: Record<string, number | string>;
    options?: CreateIndexesOptions;
}

interface RecordedDrop {
    collection: string;
    keys: string | Record<string, number | string>;
}

interface RecordedUpdate {
    collection: string;
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    options?: unknown;
}

interface AdminGroupDoc {
    name: string;
    members?: unknown[];
    [key: string]: unknown;
}

interface DeleteFilterGuard {
    members?: { $size: number };
    [key: string]: unknown;
}

function createIndexMockDb(createdIndexes: RecordedIndex[], droppedIndexes: RecordedDrop[]): Db {
    return {
        collection: (name: string) => ({
            createIndex: async (keys: IndexSpecification, options?: CreateIndexesOptions) => {
                createdIndexes.push({ collection: name, keys: keys as Record<string, number | string>, options });
                return typeof keys === "string" ? keys : "mock_index";
            },
            dropIndex: async (keys: string | IndexSpecification) => {
                droppedIndexes.push({ collection: name, keys: keys as string | Record<string, number | string> });
            },
        }),
    } as unknown as Db;
}

function createUpdateMockDb(updateOperations: RecordedUpdate[]): Db {
    return {
        collection: (name: string) => ({
            updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown>, options?: unknown) => {
                updateOperations.push({ collection: name, filter, update, options });
                return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0, upsertedId: null };
            },
        }),
    } as unknown as Db;
}

describe("Database Migration Scripts", () => {
    describe("20260826000001-optimize-schema-indexes", () => {
        it("should safely create optimized indexes and drop deprecated ones", async () => {
            assert.equal(typeof migration1.up, "function");
            assert.equal(typeof migration1.down, "function");

            const createdIndexes: RecordedIndex[] = [];
            const droppedIndexes: RecordedDrop[] = [];
            const mockDb = createIndexMockDb(createdIndexes, droppedIndexes);

            await migration1.up(mockDb);

            // Verify created indexes
            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "users" && i.keys["groups.groupId"] === 1
                ),
                "Expected index on users groups.groupId"
            );
            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "phones" && i.keys.numbers === 1
                ),
                "Expected multikey index on phones numbers"
            );
            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "shiftreports" && i.keys.groupId === 1 && i.keys.startTime === -1
                ),
                "Expected compound index on shiftreports groupId and startTime"
            );
            assert.ok(
                createdIndexes.some(
                    (i) =>
                        i.collection === "shiftschedules" &&
                        i.keys.groupId === 1 &&
                        i.keys.isPublished === 1
                ),
                "Expected compound index on shiftschedules published range"
            );
            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "sites" && i.keys.groupId === 1 && i.keys.tag === 1
                ),
                "Expected compound index on sites groupId and tag"
            );

            // Test down (rollback)
            await migration1.down(mockDb);
            assert.ok(droppedIndexes.length > 0, "Down migration should drop created indexes");
        });
    });

    describe("20260826000002-sanitize-and-backfill-defaults", () => {
        it("should backfill defaults and sanitize empty email values", async () => {
            assert.equal(typeof migration2.up, "function");
            assert.equal(typeof migration2.down, "function");

            const updateOperations: RecordedUpdate[] = [];
            const mockDb = createUpdateMockDb(updateOperations);

            await migration2.up(mockDb);

            // Verify backfill operations
            assert.ok(
                updateOperations.some(
                    (op) => op.collection === "users" && (op.filter.groups as Record<string, unknown> | undefined)?.$elemMatch !== undefined
                ),
                "Expected backfill for missing group roles using $elemMatch"
            );
            assert.ok(
                updateOperations.some(
                    (op) =>
                        op.collection === "sites" &&
                        (op.filter.tag !== undefined ||
                            (Array.isArray(op.filter.$or) &&
                                (op.filter.$or as Array<Record<string, unknown>>).some((c) => c.tag !== undefined)))
                ),
                "Expected backfill for sites default tag"
            );

            // Test down (rollback)
            const rollbackOps: RecordedUpdate[] = [];
            const mockDbDown = createUpdateMockDb(rollbackOps);
            await migration2.down(mockDbDown);
            assert.ok(
                rollbackOps.some((op) => op.collection === "users" && op.update.$unset),
                "Expected down migration to rollback user roles"
            );
            assert.ok(
                rollbackOps.some((op) => op.collection === "sites" && op.update.$unset),
                "Expected down migration to rollback site tags"
            );
        });
    });

    describe("20260824000001-create-initial-indexes", () => {
        it("should create initial unique and lookup indexes and drop them on rollback", async () => {
            assert.equal(typeof migration3.up, "function");
            assert.equal(typeof migration3.down, "function");

            const createdIndexes: RecordedIndex[] = [];
            const droppedIndexes: RecordedDrop[] = [];
            const mockDb = createIndexMockDb(createdIndexes, droppedIndexes);

            await migration3.up(mockDb);

            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "users" && i.keys.username === 1 && i.options?.unique === true
                ),
                "Expected unique index on users.username"
            );
            assert.ok(
                createdIndexes.some(
                    (i) => i.collection === "groups" && i.keys.name === 1 && i.options?.unique === true
                ),
                "Expected unique index on groups.name"
            );

            await migration3.down(mockDb);
            assert.equal(droppedIndexes.length, 8, "Expected all 8 initial indexes to be dropped in rollback");
        });
    });

    describe("20260824000002-ensure-super-admin-group", () => {
        it("should create super admin group if missing and safely delete on rollback", async () => {
            assert.equal(typeof migration4.up, "function");
            assert.equal(typeof migration4.down, "function");

            let insertedDoc: AdminGroupDoc | null = null;
            let deletedFilter: DeleteFilterGuard | null = null;

            const mockDb = {
                collection: () => ({
                    findOne: async () => null,
                    insertOne: async (doc: AdminGroupDoc) => {
                        insertedDoc = doc;
                    },
                    deleteOne: async (filter: DeleteFilterGuard) => {
                        deletedFilter = filter;
                    },
                }),
            } as unknown as Db;

            await migration4.up(mockDb);
            assert.ok(insertedDoc, "Expected admin group to be inserted");
            assert.equal((insertedDoc as AdminGroupDoc).name, process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS");

            await migration4.down(mockDb);
            assert.ok(deletedFilter, "Expected deleteOne to be called");
            assert.deepEqual((deletedFilter as DeleteFilterGuard).members, { $size: 0 }, "Expected delete filter to guard empty members");
        });
    });

    describe("20260824000003-backfill-user-defaults", () => {
        it("should backfill user defaults and unset them on rollback", async () => {
            assert.equal(typeof migration5.up, "function");
            assert.equal(typeof migration5.down, "function");

            const upOps: RecordedUpdate[] = [];
            const downOps: RecordedUpdate[] = [];

            const mockDbUp = createUpdateMockDb(upOps);
            await migration5.up(mockDbUp);
            assert.ok(
                upOps.some((op) => (op.update.$set as Record<string, unknown> | undefined)?.vacationBalance === 18),
                "Expected vacationBalance backfill to 18"
            );
            assert.ok(
                upOps.some((op) => (op.update.$set as Record<string, unknown> | undefined)?.isActive === true),
                "Expected isActive backfill to true"
            );

            const mockDbDown = createUpdateMockDb(downOps);
            await migration5.down(mockDbDown);
            assert.ok(
                downOps.some(
                    (op) =>
                        op.filter.vacationBalance === 18 &&
                        (op.update.$unset as Record<string, unknown> | undefined)?.vacationBalance !== undefined
                ),
                "Expected vacationBalance rollback via $unset"
            );
            assert.ok(
                downOps.some(
                    (op) =>
                        op.filter.isActive === true &&
                        (op.update.$unset as Record<string, unknown> | undefined)?.isActive !== undefined
                ),
                "Expected isActive rollback via $unset"
            );
        });
    });
});
