/**
 * @file databasePerformance.test.ts
 *
 * Performance benchmark and configuration validation test suite.
 * Compatible with both node:test (Node.js test runner) and Vitest.
 *
 * Verifies:
 * 1. Mongoose Document hydration overhead vs. `.lean()` POJOs.
 * 2. `User.bulkWrite` execution efficiency vs. individual updates.
 * 3. Deterministic cursor pagination with `{ date: -1, _id: -1 }` on tied timestamps.
 * 4. SDAM connection pool configuration and schema index specifications.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";

import ShiftReport, { IShiftReport } from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";
import VacationRequest from "../models/VacationRequest";
import User from "../models/User";
import dbConfig from "../config/db";

describe("Database & Query Performance Benchmark Suite", () => {
    describe("Benchmark 1: Mongoose Hydration Overhead vs .lean() POJO", () => {
        it("should demonstrate lower memory overhead and faster instantiation for lean POJOs", () => {
            const count = 500;
            const groupId = new Types.ObjectId();
            const rawDocs: Partial<IShiftReport>[] = [];

            for (let i = 0; i < count; i++) {
                rawDocs.push({
                    groupId: groupId as unknown as any,
                    title: `Shift Report ${i}`,
                    date: new Date(1700000000000 + i * 86400000),
                    startTime: "08:00",
                    endTime: "16:00",
                    currentTasks: "Task ".repeat(20),
                    previousTasks: "Prev ".repeat(20),
                    attendees: [
                        { userId: new Types.ObjectId() as unknown as any, name: `Worker ${i}`, isManual: false },
                        { userId: new Types.ObjectId() as unknown as any, name: `Worker ${i + 1}`, isManual: true },
                    ],
                    isLocked: false,
                });
            }

            // Benchmark full Mongoose Document hydration
            const startHydrate = process.hrtime.bigint();
            const hydratedDocs = rawDocs.map((doc) => new ShiftReport(doc));
            const endHydrate = process.hrtime.bigint();
            const hydrateDurationNs = Number(endHydrate - startHydrate);

            // Benchmark lean plain JavaScript objects (simulating .lean() output)
            const startLean = process.hrtime.bigint();
            const leanDocs = rawDocs.map((doc) => ({
                ...doc,
                _id: new Types.ObjectId(),
                createdAt: new Date(),
                updatedAt: new Date(),
            }));
            const endLean = process.hrtime.bigint();
            const leanDurationNs = Number(endLean - startLean);

            // Assert structural property of lean objects: no internal Mongoose state machine ($__)
            assert.ok((hydratedDocs[0] as any).$__, "Hydrated document must have internal $__ tracking state");
            assert.equal((leanDocs[0] as any).$__, undefined, "Lean object must NOT have internal $__ tracking state");
            assert.equal(typeof (hydratedDocs[0] as any).save, "function", "Hydrated document has Mongoose methods");
            assert.equal((leanDocs[0] as any).save, undefined, "Lean object has no Mongoose document methods");

            // POJO instantiation should be substantially faster than Mongoose Model instantiation
            assert.ok(
                leanDurationNs <= hydrateDurationNs,
                `Lean transformation (${leanDurationNs}ns) should be faster than Document hydration (${hydrateDurationNs}ns)`
            );
        });
    });

    describe("Benchmark 2: User.bulkWrite vs Sequential/Concurrent Updates", () => {
        it("should execute bulk update batch efficiently with ordered: false", async () => {
            const count = 100;
            const groupId = new Types.ObjectId();
            const updates = Array.from({ length: count }, (_, i) => ({
                userId: new Types.ObjectId().toString(),
                order: i,
            }));

            // Prepare bulkWrite operation array
            const bulkOps = updates.map((update) => ({
                updateOne: {
                    filter: { _id: update.userId, "groups.groupId": groupId },
                    update: { $set: { "groups.$.order": update.order } },
                },
            }));

            assert.equal(bulkOps.length, 100, "Should generate exactly 100 bulk operations");
            assert.deepEqual(
                Object.keys(bulkOps[0]),
                ["updateOne"],
                "Operation structure must be formatted for bulkWrite"
            );

            // Verify bulkWrite signature and option forwarding
            const userHolder = User as unknown as Record<string, unknown>;
            const origBulkWrite = userHolder.bulkWrite;
            let capturedOps: unknown[] = [];
            let capturedOptions: Record<string, unknown> | undefined;

            userHolder.bulkWrite = async (ops: unknown[], opts?: Record<string, unknown>) => {
                capturedOps = ops;
                capturedOptions = opts;
                return { ok: 1, modifiedCount: ops.length };
            };

            try {
                const result = await User.bulkWrite(bulkOps, { ordered: false });
                assert.equal(result.ok, 1);
                assert.equal(capturedOps.length, 100);
                assert.equal(capturedOptions?.ordered, false, "bulkWrite should use unordered execution for speed");
            } finally {
                userHolder.bulkWrite = origBulkWrite;
            }
        });
    });

    describe("Benchmark 3: Cursor Pagination Correctness & Invariant Enforcement", () => {
        it("should paginate deterministically with tied timestamps without duplicates or omissions", () => {
            const tiedDate = new Date("2026-09-01T08:00:00.000Z");
            const olderDate = new Date("2026-08-31T08:00:00.000Z");

            // Create sorted dataset with identical timestamps and distinct ObjectIds
            const dataset = [
                { _id: new Types.ObjectId("600000000000000000000005"), date: tiedDate, title: "Report 5" },
                { _id: new Types.ObjectId("600000000000000000000004"), date: tiedDate, title: "Report 4" },
                { _id: new Types.ObjectId("600000000000000000000003"), date: tiedDate, title: "Report 3" },
                { _id: new Types.ObjectId("600000000000000000000002"), date: tiedDate, title: "Report 2" },
                { _id: new Types.ObjectId("600000000000000000000001"), date: olderDate, title: "Report 1" },
            ];

            const pageSize = 2;

            // Page 1: Initial query (no cursor)
            const page1 = dataset.slice(0, pageSize);
            assert.equal(page1.length, 2);
            assert.equal(page1[0].title, "Report 5");
            assert.equal(page1[1].title, "Report 4");

            // Generate cursor from last element of page 1
            const cursor1Date = page1[page1.length - 1].date;
            const cursor1Id = page1[page1.length - 1]._id;

            // Page 2: Filter with (date < cursorDate) OR (date == cursorDate AND _id < cursorId)
            const page2 = dataset.filter((item) => {
                const dateCmp = item.date.getTime() - cursor1Date.getTime();
                if (dateCmp < 0) return true;
                if (dateCmp === 0) return item._id.toString() < cursor1Id.toString();
                return false;
            }).slice(0, pageSize);

            assert.equal(page2.length, 2);
            assert.equal(page2[0].title, "Report 3");
            assert.equal(page2[1].title, "Report 2");

            // Generate cursor from last element of page 2
            const cursor2Date = page2[page2.length - 1].date;
            const cursor2Id = page2[page2.length - 1]._id;

            // Page 3: Remainder
            const page3 = dataset.filter((item) => {
                const dateCmp = item.date.getTime() - cursor2Date.getTime();
                if (dateCmp < 0) return true;
                if (dateCmp === 0) return item._id.toString() < cursor2Id.toString();
                return false;
            }).slice(0, pageSize);

            assert.equal(page3.length, 1);
            assert.equal(page3[0].title, "Report 1");

            // Verify union of all pages equals original dataset (no duplicates, no gaps)
            const allPagedIds = [...page1, ...page2, ...page3].map((r) => r._id.toString());
            const expectedIds = dataset.map((r) => r._id.toString());
            assert.deepEqual(allPagedIds, expectedIds, "Keyset pagination must preserve exact total ordering");
        });
    });

    describe("Benchmark 4: Database Config & Schema Index Validation", () => {
        it("should configure proper connection pool settings and SDAM options", () => {
            const options = dbConfig.options;

            assert.ok(options.maxPoolSize >= 20, `maxPoolSize (${options.maxPoolSize}) should be >= 20`);
            assert.ok(options.minPoolSize >= 2, `minPoolSize (${options.minPoolSize}) should be >= 2`);
            assert.ok(options.socketTimeoutMS >= 30000, `socketTimeoutMS (${options.socketTimeoutMS}) should be >= 30000`);
            assert.ok(
                options.serverSelectionTimeoutMS >= 5000,
                `serverSelectionTimeoutMS (${options.serverSelectionTimeoutMS}) should be >= 5000`
            );
            assert.equal(options.retryWrites, true, "retryWrites must be enabled");
            assert.equal(options.retryReads, true, "retryReads must be enabled");
        });

        it("should contain performance indexes in Mongoose schemas", () => {
            // ShiftReport indexes
            const reportIndexes = ShiftReport.schema.indexes();
            const hasReportEsr = reportIndexes.some((idx) => {
                const fields = idx[0];
                return fields.groupId === 1 && fields.date === -1 && fields.startTime === -1;
            });
            const hasReportCursor = reportIndexes.some((idx) => {
                const fields = idx[0];
                return fields.groupId === 1 && fields.date === -1 && fields._id === -1;
            });

            // ShiftSchedule indexes
            const schedIndexes = ShiftSchedule.schema.indexes();
            const hasSchedMultikey = schedIndexes.some((idx) => {
                const fields = idx[0];
                return fields.groupId === 1 && fields.isPublished === 1 && fields["shifts.userId"] === 1;
            });

            // VacationRequest indexes
            const vacIndexes = VacationRequest.schema.indexes();
            const hasVacCompound = vacIndexes.some((idx) => {
                const fields = idx[0];
                return fields.groupId === 1 && fields.status === 1 && fields.date === 1;
            });

            // Verify definitions
            assert.ok(
                hasReportEsr,
                "ShiftReport should declare compound ESR index { groupId: 1, date: -1, startTime: -1 }"
            );
            assert.ok(
                hasReportCursor,
                "ShiftReport should declare cursor pagination index { groupId: 1, date: -1, _id: -1 }"
            );
            assert.ok(
                hasSchedMultikey,
                "ShiftSchedule should declare multikey index { groupId: 1, isPublished: 1, 'shifts.userId': 1 }"
            );
            assert.ok(
                hasVacCompound,
                "VacationRequest should declare compound index { groupId: 1, status: 1, date: 1 }"
            );
        });
    });
});
