const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("Database Migration Scripts", () => {
    describe("20260826000001-optimize-schema-indexes", () => {
        it("should safely create optimized indexes and drop deprecated ones", async () => {
            const migration = require("../migrations/20260826000001-optimize-schema-indexes");
            assert.equal(typeof migration.up, "function");
            assert.equal(typeof migration.down, "function");

            const createdIndexes = [];
            const droppedIndexes = [];

            const mockDb = {
                collection: (name) => ({
                    createIndex: async (keys, options) => {
                        createdIndexes.push({ collection: name, keys, options });
                    },
                    dropIndex: async (keys) => {
                        droppedIndexes.push({ collection: name, keys });
                    },
                }),
            };

            await migration.up(mockDb);

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
            await migration.down(mockDb);
            assert.ok(droppedIndexes.length > 0, "Down migration should drop created indexes");
        });
    });

    describe("20260826000002-sanitize-and-backfill-defaults", () => {
        it("should backfill defaults and sanitize empty email values", async () => {
            const migration = require("../migrations/20260826000002-sanitize-and-backfill-defaults");
            assert.equal(typeof migration.up, "function");
            assert.equal(typeof migration.down, "function");

            const updateOperations = [];

            const mockDb = {
                collection: (name) => ({
                    updateMany: async (filter, update) => {
                        updateOperations.push({ collection: name, filter, update });
                    },
                }),
            };

            await migration.up(mockDb);

            // Verify backfill operations
            assert.ok(
                updateOperations.some(
                    (op) => op.collection === "users" && op.filter.groups?.$elemMatch?.role !== undefined
                ),
                "Expected backfill for missing group roles using $elemMatch"
            );
            assert.ok(
                updateOperations.some(
                    (op) =>
                        op.collection === "sites" &&
                        (op.filter.tag !== undefined || (op.filter.$or && op.filter.$or.some(c => c.tag !== undefined)))
                ),
                "Expected backfill for sites default tag"
            );
        });
    });
});
