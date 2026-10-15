import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoServerError } from "mongodb";
import type { Db, CreateIndexesOptions, IndexSpecification } from "mongodb";

import "../models";
import createInitialIndexes, { INDEXES } from "../migrations/20260824000001-create-initial-indexes";

interface RecordedIndex {
    collection: string;
    keys: Record<string, number | string>;
    options?: CreateIndexesOptions;
}

interface RecordedDrop {
    collection: string;
    keys: string | Record<string, number | string>;
}

function createIndexMockDb(
    createdIndexes: RecordedIndex[],
    droppedIndexes: RecordedDrop[],
    dropIndex?: (collection: string, keys: string | IndexSpecification) => Promise<void>,
): Db {
    return {
        collection: (name: string) => ({
            createIndex: async (keys: IndexSpecification, options?: CreateIndexesOptions) => {
                createdIndexes.push({ collection: name, keys: keys as Record<string, number | string>, options });
                return typeof keys === "string" ? keys : "mock_index";
            },
            dropIndex: async (keys: string | IndexSpecification) => {
                if (dropIndex) await dropIndex(name, keys);
                droppedIndexes.push({ collection: name, keys: keys as string | Record<string, number | string> });
            },
        }),
    } as unknown as Db;
}

function hasIndex(indexes: RecordedIndex[], collection: string, keys: Record<string, number | string>): RecordedIndex | undefined {
    return indexes.find((i) => i.collection === collection && JSON.stringify(i.keys) === JSON.stringify(keys));
}

describe("Database Migration Scripts", () => {
    describe("20260824000001-create-initial-indexes", () => {
        it("creates every index once, in the declared order", async () => {
            const createdIndexes: RecordedIndex[] = [];
            await createInitialIndexes.up(createIndexMockDb(createdIndexes, []));

            assert.deepEqual(
                createdIndexes,
                INDEXES.map(({ collection, keys, options }) => ({ collection, keys, options: options ?? {} })),
            );
            const signatures = createdIndexes.map((i) => `${i.collection}:${JSON.stringify(i.keys)}`);
            assert.equal(new Set(signatures).size, signatures.length, "no index is declared twice");
        });

        it("creates exactly the indexes the Mongoose schemas declare", () => {
            // Preprod and prod run with autoIndex off: an index a schema declares exists there only
            // if a migration creates it. A new schema index needs a new migration (and this test updated).
            const signature = (collection: string, keys: unknown, options: unknown) =>
                `${collection} ${JSON.stringify(keys)} ${JSON.stringify(options ?? {})}`;
            const declared = mongoose.modelNames().flatMap((name) => {
                const model = mongoose.model(name);
                return model.schema.indexes().map(([keys, options]) => signature(model.collection.collectionName, keys, options));
            });
            const migrated = INDEXES.map(({ collection, keys, options }) => signature(collection, keys, options));

            assert.deepEqual([...migrated].sort(), [...declared].sort());
        });

        it("creates the unique indexes the models rely on", async () => {
            const createdIndexes: RecordedIndex[] = [];
            await createInitialIndexes.up(createIndexMockDb(createdIndexes, []));

            for (const [collection, keys] of [
                ["users", { username: 1 }],
                ["users", { email: 1 }],
                ["users", { ssoIssuer: 1, ssoSubject: 1 }],
                ["groups", { name: 1 }],
                ["shiftschedules", { groupId: 1, startDate: 1 }],
                ["shiftreports", { groupId: 1, title: 1 }],
            ] as const) {
                const index = hasIndex(createdIndexes, collection, keys);
                assert.ok(index, `Expected index on ${collection} ${JSON.stringify(keys)}`);
                assert.equal(index.options?.unique, true, `${collection} ${JSON.stringify(keys)} must be unique`);
            }
            assert.equal(hasIndex(createdIndexes, "users", { email: 1 })?.options?.sparse, undefined, "email is required, so its index is not sparse");
        });

        it("drops every index on rollback and skips ones that do not exist", async () => {
            const droppedIndexes: RecordedDrop[] = [];
            const missing = new MongoServerError({ message: "index not found", code: 27, codeName: "IndexNotFound" });
            const mockDb = createIndexMockDb([], droppedIndexes, async (collection) => {
                if (collection === "phones") throw missing;
            });

            await createInitialIndexes.down(mockDb);

            const expected = INDEXES.filter((i) => i.collection !== "phones");
            assert.deepEqual(droppedIndexes, expected.map(({ collection, keys }) => ({ collection, keys })));
        });

        it("surfaces any other rollback error", async () => {
            const mockDb = createIndexMockDb([], [], async () => {
                throw new Error("connection lost");
            });

            await assert.rejects(() => createInitialIndexes.down(mockDb), /connection lost/);
        });
    });
});
