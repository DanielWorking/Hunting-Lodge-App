const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("node:fs");
const path = require("node:path");

describe("Defect Regression: Event Loop Non-Blocking & Cron/Mongoose Resilience", () => {
    after(() => {
        try {
            const cronJobs = require("../services/cronJobs");
            if (cronJobs && typeof cronJobs.stopCronJobs === "function") {
                cronJobs.stopCronJobs();
            }
        } catch {
            // Ignore if not loaded
        }
    });

    describe("1. Static Analysis & Event Loop Blocker Prevention", () => {
        it("should not use synchronous fs methods (e.g. existsSync) in app.js request paths", () => {
            const appCode = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
            assert.ok(
                !appCode.includes("fs.existsSync("),
                "app.js must not call fs.existsSync in request handling paths to prevent event loop blocking"
            );
        });

        it("should not silently swallow errors in schedulesController rollback", () => {
            const controllerCode = fs.readFileSync(path.join(__dirname, "../controllers/schedulesController.js"), "utf8");
            assert.ok(
                !controllerCode.includes(".catch(() => {})"),
                "schedulesController.js must not use empty .catch(() => {}) which swallows rollback errors"
            );
        });
    });

    describe("2. Database Configuration SDAM Hardening", () => {
        it("should configure robust Mongoose connection timeouts and pool sizes to survive event loop lag", () => {
            const config = require("../config");
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
            const cronJobs = require("../services/cronJobs");
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
            const cronJobs = require("../services/cronJobs");
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
            const cronJobs = require("../services/cronJobs");
            const Group = require("../models/Group");
            const ShiftReport = require("../models/ShiftReport");
            const ShiftSchedule = require("../models/ShiftSchedule");

            const testGroupId = new mongoose.Types.ObjectId();
            const originalGroupFind = Group.find;
            const originalReportFindOne = ShiftReport.findOne;
            const originalScheduleFindOne = ShiftSchedule.findOne;
            const originalReportSave = ShiftReport.prototype.save;

            let savedReport = null;

            Group.find = () => ({
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

            ShiftReport.findOne = () => ({
                lean: async () => null,
                sort: () => ({
                    lean: async () => null,
                }),
            });

            ShiftSchedule.findOne = () => ({
                lean: async () => null,
            });

            ShiftReport.prototype.save = async function () {
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
                    savedReport.title.includes("משמרת בוקר"),
                    `Report title should contain slot name, got: ${savedReport?.title}`
                );
            } finally {
                Object.defineProperty(mongoose.connection, "readyState", {
                    value: originalReadyState,
                    configurable: true,
                });
                Group.find = originalGroupFind;
                ShiftReport.findOne = originalReportFindOne;
                ShiftSchedule.findOne = originalScheduleFindOne;
                ShiftReport.prototype.save = originalReportSave;
            }
        });

        it("should isolate errors in individual groups without crashing or halting the entire run", async () => {
            const cronJobs = require("../services/cronJobs");
            const Group = require("../models/Group");

            const originalGroupFind = Group.find;
            const originalReadyState = mongoose.connection.readyState;
            Object.defineProperty(mongoose.connection, "readyState", {
                value: 1,
                configurable: true,
            });

            Group.find = () => ({
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
                Group.find = originalGroupFind;
            }
        });
    });

    describe("4. Mock Load & Event Loop Non-Blocking Verification", () => {
        it("should handle high concurrent traffic without blocking the event loop or dropping tasks", async () => {
            const http = require("node:http");
            const app = require("../app");
            const cronJobs = require("../services/cronJobs");

            const server = http.createServer(app);
            await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
            const port = server.address().port;
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
                const requests = [];
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

                // Event loop lag must remain below 500ms (blocking sync I/O stalls for seconds)
                assert.ok(
                    maxLagMs < 500,
                    `Event loop lag exceeded threshold: ${maxLagMs.toFixed(2)}ms`
                );
            } finally {
                await new Promise((resolve) => server.close(resolve));
            }
        });
    });
});

