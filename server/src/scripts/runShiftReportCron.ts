/**
 * @module runShiftReportCron
 *
 * Standalone worker runner script for OpenShift CronJob execution.
 * Establishes a dedicated Mongoose database connection, triggers shift report
 * generation, disconnects cleanly, and terminates with proper POSIX exit codes.
 */

import mongoose from "mongoose";
import config from "../config";
import { runShiftReportGenerator, stopCronJobs } from "../services/cronJobs";

// Track exit status to avoid redundant signal invocations
let isShuttingDown = false;

/**
 * Safely disconnects Mongoose with a strict timeout to prevent hangs.
 */
const safeDisconnect = async (timeoutMs: number = 5000): Promise<void> => {
    try {
        if (typeof stopCronJobs === "function") {
            stopCronJobs();
        }
        if (mongoose.connection.readyState !== 0) {
            await Promise.race([
                mongoose.disconnect(),
                new Promise<void>((_, reject) =>
                    setTimeout(() => reject(new Error(`Database disconnect timed out after ${timeoutMs}ms`)), timeoutMs)
                ),
            ]);
            console.log("🔒 [Cron Worker] MongoDB connection closed cleanly.");
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`⚠️ [Cron Worker] Warning during database disconnect: ${msg}`);
    }
};

/**
 * Handles graceful shutdown on container termination signals (SIGTERM / SIGINT).
 */
const handleSignal = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 [Cron Worker] Received ${signal}. Terminating gracefully...`);

    // Safety fallback: force exit if disconnect takes longer than 6 seconds
    const forceExitTimer = setTimeout((): void => {
        console.error("⚠️ [Cron Worker] Forced exit due to shutdown timeout.");
        process.exit(1);
    }, 6000);
    forceExitTimer.unref();

    await safeDisconnect(5000);
    process.exit(1);
};

process.on("SIGTERM", () => void handleSignal("SIGTERM"));
process.on("SIGINT", () => void handleSignal("SIGINT"));

/**
 * Main execution function for the standalone shift report runner.
 */
export async function main(): Promise<void> {
    const startTime = Date.now();
    console.log("==================================================");
    console.log("🚀 [Cron Worker] Starting Shift Report Job...");
    console.log(`⏱️  Timestamp: ${new Date().toISOString()} [TZ: Asia/Jerusalem]`);
    console.log("==================================================");

    let hasError = false;

    // Set safety timer: if the job takes longer than 90s, terminate before OpenShift's 120s limit
    const jobTimeoutTimer = setTimeout((): void => {
        console.error("❌ [Cron Worker] Execution timed out (90s limit reached). Terminating process.");
        void safeDisconnect(3000).finally(() => process.exit(1));
    }, 90000);
    jobTimeoutTimer.unref();

    try {
        // 1. Establish database connection
        console.log("📦 [Cron Worker] Connecting to MongoDB...");
        await mongoose.connect(config.mongoUri, config.database ? config.database.options : {});
        console.log(`✅ [Cron Worker] MongoDB connected to host: ${mongoose.connection.host}`);

        // 2. Execute business logic
        console.log("⚙️  [Cron Worker] Generating shift reports...");
        await runShiftReportGenerator();
        const duration = Date.now() - startTime;
        console.log(`✨ [Cron Worker] Shift report generation finished successfully in ${duration}ms.`);
    } catch (error: unknown) {
        hasError = true;
        const errorStack = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error("❌ [Cron Worker] Fatal error executing shift report generator:", errorStack);
    } finally {
        // 3. Ensure database connection is closed cleanly before process termination
        clearTimeout(jobTimeoutTimer);
        await safeDisconnect(5000);

        const exitCode = hasError ? 1 : 0;
        console.log(`🏁 [Cron Worker] Process exiting with code: ${exitCode}`);
        process.exitCode = exitCode;
        process.exit(exitCode);
    }
}

// Global unhandled rejection / exception traps
process.on("unhandledRejection", (reason: unknown) => {
    console.error("❌ [Cron Worker] Unhandled Promise Rejection:", reason);
    void safeDisconnect(3000)
        .catch((err: unknown) => console.error("⚠️ [Cron Worker] Secondary error during emergency disconnect:", err))
        .finally(() => process.exit(1));
});

process.on("uncaughtException", (error: Error) => {
    console.error("❌ [Cron Worker] Uncaught Exception:", error);
    void safeDisconnect(3000)
        .catch((err: unknown) => console.error("⚠️ [Cron Worker] Secondary error during emergency disconnect:", err))
        .finally(() => process.exit(1));
});

// Auto-execute if invoked as CLI entry point
if (require.main === module) {
    void main();
}
