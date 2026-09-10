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
 * Establishes a connection to the MongoDB database using the configured URI and connection pool parameters.
 * Terminates the process with an error code if the initial connection fails.
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
};

// Initialize database connection
void connectDB();

// Start listening for incoming requests
const server: http.Server = app.listen(config.port, (): void => {
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

/**
 * Gracefully shuts down the HTTP server and database connection.
 * Essential for OpenShift / Kubernetes rolling updates and zero-downtime deployments.
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
    console.log(`\n🛑 ${signal} received. Initiating graceful shutdown...`);
    if (typeof stopCronJobs === "function") {
        stopCronJobs();
    }
    server.close(async (): Promise<void> => {
        console.log("🔒 HTTP server closed.");
        try {
            await mongoose.connection.close(false);
            console.log("🔒 MongoDB connection closed.");
            process.exit(0);
        } catch (err: unknown) {
            console.error("❌ Error closing MongoDB connection:", err);
            process.exit(1);
        }
    });

    // Force shutdown if connections do not close within 10 seconds
    setTimeout((): void => {
        console.error("⚠️  Forced shutdown due to timeout.");
        process.exit(1);
    }, 10000).unref();
};

process.on("SIGTERM", (): Promise<void> => gracefulShutdown("SIGTERM"));
process.on("SIGINT", (): Promise<void> => gracefulShutdown("SIGINT"));

export { app, server };