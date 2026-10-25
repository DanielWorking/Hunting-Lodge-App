/**
 * @module Server
 *
 * Entry point for the Hunting Lodge API server and static asset host.
 * Handles environment configuration, database connection,
 * OpenShift health probes, and graceful process termination.
 */

import path from "path";
import fs from "fs";
import http from "http";
import mongoose from "mongoose";
import config from "./src/config";
import app from "./app";
import { stopCronJobs } from "./src/services/cronJobs";
import { ensureAdminGroup } from "./src/services/adminGroup";

// === Mongoose Connection Lifecycle Event Listeners ===
mongoose.connection.on("connected", (): void => {
    console.log(`✅ [MongoDB] Connection established to: ${mongoose.connection.host}`);
});

mongoose.connection.on("error", (err: Error): void => {
    console.error(`❌ [MongoDB] Connection error: ${err.message}`);
});

mongoose.connection.on("disconnected", (): void => {
    console.warn("⚠️  [MongoDB] Lost database connection. Waiting for reconnect...");
});

mongoose.connection.on("reconnected", (): void => {
    console.log("🔄 [MongoDB] Reconnected to database successfully.");
});

mongoose.connection.on("close", (): void => {
    console.log("🔒 [MongoDB] Connection closed.");
});

/**
 * Establishes a connection to the MongoDB database using the configured URI and connection pool parameters,
 * then creates the administrators group if it is missing (without it nobody can be granted access).
 * Terminates the process with an error code if either step fails, so the platform restarts it.
 */
const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongoUri, config.database.options);
        const { minPoolSize, maxPoolSize, serverSelectionTimeoutMS } = config.database.options;
        console.log(
            `📦 [MongoDB] Pool initialized: minPoolSize=${minPoolSize}, maxPoolSize=${maxPoolSize}, serverSelectionTimeoutMS=${serverSelectionTimeoutMS}ms`
        );
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ [MongoDB] Initial connection failed: ${errorMessage}`);
        process.exit(1);
    }

    try {
        if (await ensureAdminGroup()) {
            console.log("👑 [Bootstrap] Created the administrators group (SUPER_ADMIN_GROUP_NAME)");
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ [Bootstrap] Could not create the administrators group: ${errorMessage}`);
        process.exit(1);
    }
};

let server: http.Server | undefined;

/**
 * Connects to MongoDB prior to binding the HTTP listener so cold-start
 * requests cannot hit routes before the database and admin group are ready.
 */
const startServer = async (): Promise<void> => {
    await connectDB();

    server = app.listen(config.port, (): void => {
        console.log(`🚀 Server is running on port ${config.port} [Environment: ${config.env}]`);
        fs.promises
            .access(path.join(config.staticFilesPath, "index.html"), fs.constants.F_OK)
            .then((): void => {
                console.log(`📦 Serving React SPA static assets from: ${config.staticFilesPath}`);
            })
            .catch((): void => {
                console.log(`ℹ️  Static assets directory not found at: ${config.staticFilesPath} (Client UI will not be served)`);
            });
    });

    // Configure keep-alive and headers timeout for reverse-proxy alignment (ALB / Nginx / OpenShift Router)
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000;   // 66 seconds (must exceed keepAliveTimeout)
    server.requestTimeout = 30000;   // 30 seconds
};

/**
 * Gracefully shuts down the HTTP server and database connection.
 * Essential for OpenShift / Kubernetes rolling updates and zero-downtime deployments.
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
    console.log(`\n🛑 ${signal} received. Initiating graceful shutdown...`);
    if (typeof stopCronJobs === "function") {
        stopCronJobs();
    }

    const isCrash = signal === "UNHANDLED_REJECTION" || signal === "UNCAUGHT_EXCEPTION";

    const closeDatabaseAndExit = async (): Promise<void> => {
        try {
            await mongoose.connection.close(false);
            console.log("🔒 MongoDB connection closed.");
            process.exit(isCrash ? 1 : 0);
        } catch (err: unknown) {
            console.error("❌ Error closing MongoDB connection:", err);
            process.exit(1);
        }
    };

    if (server) {
        server.close((): void => {
            console.log("🔒 HTTP server closed.");
            void closeDatabaseAndExit();
        });
    } else {
        await closeDatabaseAndExit();
        return;
    }

    // Force shutdown if connections do not close within 10 seconds
    setTimeout((): void => {
        console.error("⚠️  Forced shutdown due to timeout.");
        process.exit(1);
    }, 10000).unref();
};

process.on("SIGTERM", (): Promise<void> => gracefulShutdown("SIGTERM"));
process.on("SIGINT", (): Promise<void> => gracefulShutdown("SIGINT"));
process.on("unhandledRejection", (reason: unknown): void => {
    console.error("❌ [Process] Unhandled Promise Rejection:", reason);
    void gracefulShutdown("UNHANDLED_REJECTION");
});
process.on("uncaughtException", (err: Error): void => {
    console.error("❌ [Process] Uncaught Exception:", err);
    void gracefulShutdown("UNCAUGHT_EXCEPTION");
});

void startServer();
