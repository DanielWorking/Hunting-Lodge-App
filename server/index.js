/**
 * @module Server
 *
 * Entry point for the Hunting Lodge API server and static asset host.
 * Handles environment configuration, database connection,
 * OpenShift health probes, and graceful process termination.
 */

const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const config = require("./config");
const app = require("./app");

// === Mongoose Connection Lifecycle Event Listeners ===
mongoose.connection.on("connected", () => {
    console.log(`✅ [MongoDB] Connection established to: ${mongoose.connection.host}`);
});

mongoose.connection.on("error", (err) => {
    console.error(`❌ [MongoDB] Connection error: ${err.message}`);
});

mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  [MongoDB] Lost database connection. Waiting for reconnect...");
});

mongoose.connection.on("reconnected", () => {
    console.log("🔄 [MongoDB] Reconnected to database successfully.");
});

mongoose.connection.on("close", () => {
    console.log("🔒 [MongoDB] Connection closed.");
});

/**
 * Establishes a connection to the MongoDB database using the configured URI and connection pool parameters.
 *
 * Terminates the process with an error code if the initial connection fails, as the application
 * cannot function without an active database connection.
 *
 * @async
 * @function connectDB
 * @returns {Promise<void>}
 * @throws {Error} If the initial connection to MongoDB fails.
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongoUri, config.database.options);
        const { minPoolSize, maxPoolSize, serverSelectionTimeoutMS } = config.database.options;
        console.log(
            `📦 [MongoDB] Pool initialized: minPoolSize=${minPoolSize}, maxPoolSize=${maxPoolSize}, serverSelectionTimeoutMS=${serverSelectionTimeoutMS}ms`
        );
    } catch (error) {
        console.error(`❌ [MongoDB] Initial connection failed: ${error.message}`);
        process.exit(1);
    }
};

// Initialize database connection
connectDB().catch(console.error);

// Initialize background tasks (Cron Jobs)
require("./services/cronJobs");

// Start listening for incoming requests
const server = app.listen(config.port, () => {
    console.log(`🚀 Server is running on port ${config.port} [Environment: ${config.env}]`);
    if (fs.existsSync(path.join(config.staticFilesPath, "index.html"))) {
        console.log(`📦 Serving React SPA static assets from: ${config.staticFilesPath}`);
    } else {
        console.log(`ℹ️  Static assets directory not found at: ${config.staticFilesPath} (Client UI will not be served)`);
    }
});

/**
 * Gracefully shuts down the HTTP server and database connection.
 * Essential for OpenShift / Kubernetes rolling updates and zero-downtime deployments.
 *
 * @param {string} signal - The termination signal received (e.g. 'SIGTERM', 'SIGINT').
 */
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received. Initiating graceful shutdown...`);
    server.close(async () => {
        console.log("🔒 HTTP server closed.");
        try {
            await mongoose.connection.close(false);
            console.log("🔒 MongoDB connection closed.");
            process.exit(0);
        } catch (err) {
            console.error("❌ Error closing MongoDB connection:", err);
            process.exit(1);
        }
    });

    // Force shutdown if connections do not close within 10 seconds
    setTimeout(() => {
        console.error("⚠️  Forced shutdown due to timeout.");
        process.exit(1);
    }, 10000).unref();
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = { app, server };
