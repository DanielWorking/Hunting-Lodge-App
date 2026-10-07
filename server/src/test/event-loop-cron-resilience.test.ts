import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";

import config from "../config";
import app from "../../app";
import * as cronJobs from "../services/cronJobs";
import Group from "../models/Group";
import ShiftReport, { type ShiftReportDocument } from "../models/ShiftReport";
import ShiftSchedule from "../models/ShiftSchedule";

describe("Defect Regression: Event Loop Non-Blocking & Cron/Mongoose Resilience", () => {
    after(() => {
        try {
            if (cronJobs && typeof cronJobs.stopCronJobs === "function") {
                cronJobs.stopCronJobs();
            }
        } catch (err: unknown) {
            console.error("Failed to stop cron jobs in test cleanup:", err);
        }
    });

    describe("1. Static Analysis & Event Loop Blocker Prevention", () => {
        it("should not use synchronous fs methods (e.g. existsSync) in app.ts request paths", () => {
            const appPath = fs.existsSync(path.join(__dirname, "../../app.ts"))
                ? path.join(__dirname, "../../app.ts")
                : path.join(__dirname, "../../app.js");
            const appCode = fs.readFileSync(appPath, "utf8");
            assert.ok(
                !appCode.includes("fs.existsSync("),
                "app.ts must not call fs.existsSync in request handling paths to prevent event loop blocking"
            );
        });

        it("should not silently swallow errors in schedulesController rollback", () => {
            const controllerPath = fs.existsSync(path.join(__dirname, "../controllers/schedulesController.ts"))
                ? path.join(__dirname, "../controllers/schedulesController.ts")
                : path.join(__dirname, "../controllers/schedulesController.js");
            const controllerCode = fs.readFileSync(controllerPath, "utf8");
            assert.ok(
                !controllerCode.includes(".catch(() => {})"),
                "schedulesController must not use empty .catch(() => {}) which swallows rollback errors"
            );
        });
    });

    describe("2. Database Configuration SDAM Hardening", () => {
        it("should configure robust Mongoose connection timeouts and pool sizes to survive event loop lag", () => {
            const dbOptions = config.database.options;

            assert.ok(
                dbOptions.serverSelectionTimeoutMS >= 30000,
                `serverSelectionTimeoutMS should be at least 30000ms, got ${dbOptions.serverSelectionTimeoutMS}`
            );
            assert.equal(
                dbOptions.heartbeatFrequencyMS,
                10000,
                `heartbeatFrequencyMS should be configured to 10000ms, got ${dbOptions.heartbeatFrequencyMS}`
            );
            assert.ok(
                dbOptions.maxPoolSize >= 20,
                `maxPoolSize should be at least 20, got ${dbOptions.maxPoolSize}`
            );
            assert.equal(
                dbOptions.retryWrites,
                true,
                "retryWrites should be enabled"
            );
        });
    });

    describe("3. Cron Jobs Export, Concurrency Lock, Lag Recovery & Error Boundaries", () => {
        it("should export runShiftReportGenerator and stopCronJobs for lifecycle management", () => {
            assert.equal(
                typeof cronJobs.runShiftReportGenerator,
                "function",
                "cronJobs must export runShiftReportGenerator function"
            );
            assert.equal(
                typeof cronJobs.stopCronJobs,
                "function",
                "cronJobs must export stopCronJobs function"
            );
        });

        it("should gracefully skip execution if MongoDB readyState !== 1 to avoid query buffering timeouts", async () => {
            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 0, // Disconnected
                configurable: true,
            });

            try {
                // Should return without throwing or hanging
                await cronJobs.runShiftReportGenerator(new Date());
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
            }
        });

        it("should recover and generate shift report when cron tick is delayed by 3 minutes due to event loop lag", async () => {
            const testGroupId = new mongoose.Types.ObjectId();

            const groupHolder = Group as unknown as Record<string, unknown>;
            const reportHolder = ShiftReport as unknown as Record<string, unknown>;
            const scheduleHolder = ShiftSchedule as unknown as Record<string, unknown>;

            const originalGroupFind = groupHolder.find;
            const originalReportFindOne = reportHolder.findOne;
            const originalScheduleFindOne = scheduleHolder.findOne;
            const originalReportSave = ShiftReport.prototype.save;

            let savedReport: ShiftReportDocument | null = null;

            groupHolder.find = () => ({
                lean: async () => [
                    {
                        _id: testGroupId,
                        name: "Lag Test Group",
                        settings: {
                            timeSlots: [
                                {
                                    name: "משמרת בוקר",
                                    startTime: "08:00",
                                    endTime: "14:00",
                                    linkedShiftTypes: [],
                                },
                            ],
                        },
                    },
                ],
            });

            reportHolder.findOne = () => ({
                lean: async () => null,
                sort: () => ({
                    lean: async () => null,
                }),
            });

            scheduleHolder.findOne = () => ({
                lean: async () => null,
            });

            ShiftReport.prototype.save = async function (this: ShiftReportDocument) {
                savedReport = this;
                return this;
            };

            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            try {
                // Simulate running at 08:03 Jerusalem time (3 minutes late due to event loop stall)
                // In Jerusalem (UTC+3 in Sep), 08:03 is 05:03 UTC
                const delayedTickTime = new Date("2026-09-04T05:03:00.000Z");

                await cronJobs.runShiftReportGenerator(delayedTickTime);

                assert.ok(
                    savedReport !== null,
                    "Shift report should be created even if event loop lag delayed the cron tick by 3 minutes"
                );
                assert.ok(
                    (savedReport as ShiftReportDocument).title.includes("משמרת בוקר"),
                    `Report title should contain slot name, got: ${(savedReport as ShiftReportDocument | null)?.title}`
                );
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
                groupHolder.find = originalGroupFind;
                reportHolder.findOne = originalReportFindOne;
                scheduleHolder.findOne = originalScheduleFindOne;
                ShiftReport.prototype.save = originalReportSave;
            }
        });

        it("should isolate errors in individual groups without crashing or halting the entire run", async () => {
            const groupHolder = Group as unknown as Record<string, unknown>;
            const originalGroupFind = groupHolder.find;
            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            groupHolder.find = () => ({
                lean: async () => [
                    {
                        _id: new mongoose.Types.ObjectId(),
                        name: "Faulty Group",
                        get settings() {
                            throw new Error("Simulated group corruption");
                        },
                    },
                ],
            });

            try {
                // Must not throw an unhandled exception
                await cronJobs.runShiftReportGenerator(new Date());
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
                groupHolder.find = originalGroupFind;
            }
        });

        it("should safely drop duplicate key error (E11000) when concurrent pod creates shift report", async () => {
            const testGroupId = new mongoose.Types.ObjectId();

            const groupHolder = Group as unknown as Record<string, unknown>;
            const reportHolder = ShiftReport as unknown as Record<string, unknown>;
            const scheduleHolder = ShiftSchedule as unknown as Record<string, unknown>;

            const originalGroupFind = groupHolder.find;
            const originalReportFindOne = reportHolder.findOne;
            const originalScheduleFindOne = scheduleHolder.findOne;
            const originalReportSave = ShiftReport.prototype.save;
            const originalConsoleWarn = console.warn;

            const warnLogs: string[] = [];
            console.warn = (...args: unknown[]) => {
                warnLogs.push(args.map(String).join(" "));
            };

            groupHolder.find = () => ({
                lean: async () => [
                    {
                        _id: testGroupId,
                        name: "Concurrent Pod Test Group",
                        settings: {
                            timeSlots: [
                                {
                                    name: "משמרת בוקר",
                                    startTime: "08:00",
                                    endTime: "14:00",
                                    linkedShiftTypes: [],
                                },
                            ],
                        },
                    },
                ],
            });

            reportHolder.findOne = () => ({
                lean: async () => null,
                sort: () => ({
                    lean: async () => null,
                }),
            });

            scheduleHolder.findOne = () => ({
                lean: async () => null,
            });

            // Simulate save throwing E11000 duplicate key exception from MongoDB driver
            ShiftReport.prototype.save = async function (this: ShiftReportDocument) {
                const dupError = new Error(
                    "E11000 duplicate key error collection: hunting_lodge_db.shiftreports index: groupId_1_title_1 dup key: { groupId: ObjectId('123'), title: 'משמרת בוקר - 04/09/2026' }"
                );
                (dupError as unknown as { code: number }).code = 11000;
                (dupError as unknown as { codeName: string }).codeName = "DuplicateKey";
                (dupError as unknown as { errorResponse: { code: number; codeName: string } }).errorResponse = {
                    code: 11000,
                    codeName: "DuplicateKey",
                };
                throw dupError;
            };

            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            try {
                const tickTime = new Date("2026-09-04T05:00:00.000Z"); // 08:00 Jerusalem time

                // Must complete cleanly without unhandled rejection
                await cronJobs.runShiftReportGenerator(tickTime);

                const hasDuplicateWarning = warnLogs.some((msg) =>
                    msg.includes("[Cron] Report already exists (duplicate key dropped safely)")
                );
                assert.ok(
                    hasDuplicateWarning,
                    `Expected warning indicating duplicate key dropped safely, got logs: ${JSON.stringify(warnLogs)}`
                );
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
                groupHolder.find = originalGroupFind;
                reportHolder.findOne = originalReportFindOne;
                scheduleHolder.findOne = originalScheduleFindOne;
                ShiftReport.prototype.save = originalReportSave;
                console.warn = originalConsoleWarn;
            }
        });

        it("should detect and safely drop duplicate key error in processGroupSlot across error shapes", async () => {
            const testGroup = {
                _id: new mongoose.Types.ObjectId(),
                name: "Multi-pod Group",
            };
            const testSlot = {
                name: "Morning",
                startTime: "08:00",
                endTime: "16:00",
            };
            const now = new Date("2026-09-04T05:00:00.000Z");
            const currentJerusalemMinutes = 8 * 60;

            const reportHolder = ShiftReport as unknown as Record<string, unknown>;
            const scheduleHolder = ShiftSchedule as unknown as Record<string, unknown>;
            const originalReportFindOne = reportHolder.findOne;
            const originalScheduleFindOne = scheduleHolder.findOne;
            const originalReportSave = ShiftReport.prototype.save;
            const originalConsoleWarn = console.warn;

            reportHolder.findOne = () => ({
                lean: async () => null,
                sort: () => ({
                    lean: async () => null,
                }),
            });

            scheduleHolder.findOne = () => ({
                lean: async () => null,
            });

            const errorVariants = [
                { code: 11000 },
                { codeName: "DuplicateKey" },
                { errorResponse: { code: 11000 } },
                { errorResponse: { codeName: "DuplicateKey" } },
                new Error("E11000 duplicate key error"),
            ];

            try {
                for (const errVariant of errorVariants) {
                    let loggedWarn = false;
                    console.warn = (msg: unknown) => {
                        if (String(msg).includes("[Cron] Report already exists (duplicate key dropped safely)")) {
                            loggedWarn = true;
                        }
                    };

                    ShiftReport.prototype.save = async function () {
                        throw errVariant;
                    };

                    await cronJobs.processGroupSlot(testGroup, testSlot, now, currentJerusalemMinutes);
                    assert.ok(loggedWarn, `Failed to detect duplicate key for error variant: ${JSON.stringify(errVariant)}`);
                }
            } finally {
                reportHolder.findOne = originalReportFindOne;
                scheduleHolder.findOne = originalScheduleFindOne;
                ShiftReport.prototype.save = originalReportSave;
                console.warn = originalConsoleWarn;
            }
        });
    });

    describe("4. Mock Load & Event Loop Non-Blocking Verification", () => {
        it("should handle high concurrent traffic without blocking the event loop or dropping tasks", async () => {
            const server = http.createServer(app);
            await new Promise<void>((resolve) => {
                server.listen(0, "127.0.0.1", () => resolve());
            });
            const address = server.address() as AddressInfo;
            const port = address.port;
            const baseUrl = `http://127.0.0.1:${port}`;

            try {
                // Monitor event loop lag during concurrent request burst
                let maxLagMs = 0;
                let isMonitoring = true;

                const checkLag = () => {
                    const start = performance.now();
                    setImmediate(() => {
                        const lag = performance.now() - start;
                        if (lag > maxLagMs) maxLagMs = lag;
                        if (isMonitoring) checkLag();
                    });
                };
                checkLag();

                // Fire 60 concurrent requests across SPA fallback and API paths
                const endpoints = ["/", "/sites", "/admin/users", "/groups/123/edit", "/api/health"];
                const requests: Promise<globalThis.Response>[] = [];
                for (let i = 0; i < 60; i++) {
                    const endpoint = endpoints[i % endpoints.length];
                    requests.push(fetch(`${baseUrl}${endpoint}`));
                }

                // Simultaneously execute cron report generator cycle
                const cronPromise = cronJobs.runShiftReportGenerator(new Date());

                const [responses] = await Promise.all([Promise.all(requests), cronPromise]);

                isMonitoring = false;

                // Verify all HTTP requests succeeded (200 for SPA, 503 for health when DB is disconnected, 404 for unmatched)
                for (const res of responses) {
                    assert.ok(
                        res.status === 200 || res.status === 503 || res.status === 404,
                        `Unexpected HTTP response status: ${res.status}`
                    );
                }

                // Event loop lag must remain below 2500ms (blocking sync I/O stalls for many seconds)
                assert.ok(
                    maxLagMs < 2500,
                    `Event loop lag exceeded threshold: ${maxLagMs.toFixed(2)}ms`
                );
            } finally {
                await new Promise<void>((resolve) => {
                    server.close(() => resolve());
                });
            }
        });
    });
});
