/**
 * @module Server
 *
 * Entry point for the Hunting Lodge API server and static asset host.
 * Handles environment configuration, database connection, middleware setup,
 * route registration, React SPA static serving, OpenShift health probes,
 * and graceful process termination.
 */

const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const mongoose = require("mongoose");
const config = require("./config");
const authRoutes = require("./routes/auth");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// Configure reverse proxy trust for correct client IP resolution behind proxies (OpenShift Router, Nginx, ALB)
app.set("trust proxy", config.security.trustProxy);

// Global Middleware setup
app.use(morgan(config.logging.morganFormat)); // HTTP request logger (dev vs combined)

// Secure HTTP headers with tailored Content Security Policy (CSP) for React, Material-UI & Google Fonts
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", config.sso.issuerUrl ? config.sso.issuerUrl : ""].filter(Boolean),
                objectSrc: ["'none'"],
                upgradeInsecureRequests: config.isProd ? [] : null,
            },
        },
    })
);

// CORS configuration (Permissive in Dev, restricted in Prod if configured)
if (config.security.corsOrigin === true) {
    app.use(cors());
} else if (config.security.corsOrigin) {
    app.use(cors({ origin: config.security.corsOrigin, credentials: true }));
} else {
    app.use(cors());
}

app.use(express.json());

// Apply rate limiting to all requests based on environment configuration
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use(limiter);

/**
 * Establishes a connection to the MongoDB database using the URI provided in configuration.
 *
 * Terminates the process with an error code if the initial connection fails, as the application
 * cannot function without a database.
 *
 * @async
 * @function connectDB
 * @throws {Error} If the connection to MongoDB fails.
 */
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.mongoUri);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    }
};

// Initialize database connection
connectDB();

// Initialize background tasks (Cron Jobs)
require("./services/cronJobs");

/**
 * Health check handler for OpenShift / Kubernetes liveness and readiness probes.
 *
 * Checks database readiness state and returns system uptime and timestamp.
 *
 * @function healthHandler
 * @param {import("express").Request}  req  - Express request object.
 * @param {import("express").Response} res  - Express response object.
 * @returns {void}
 */
const healthHandler = (req, res) => {
    const isDbConnected = mongoose.connection.readyState === 1;
    const status = isDbConnected ? "UP" : "DEGRADED";
    const statusCode = isDbConnected ? 200 : 503;

    res.status(statusCode).json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: {
            status: isDbConnected ? "connected" : "disconnected",
            readyState: mongoose.connection.readyState,
        },
    });
};

// Register OpenShift / Kubernetes health probe endpoints
app.get("/api/health", healthHandler);
app.get("/healthz", healthHandler);

// === API Route Definitions ===
app.use("/api/sites", require("./routes/sites"));
app.use("/api/phones", require("./routes/phones"));
app.use("/api/groups", require("./routes/groups"));
app.use("/api/users", require("./routes/users"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/reports", require("./routes/reports"));

// SSO Authentication Routes
app.use("/api/auth", authRoutes);

// === Static Asset Serving & React SPA Fallback (Production & Container Deployments) ===
const staticPath = config.staticFilesPath;

// Serve pre-built static assets (Vite hashed bundles, images, fonts)
app.use(
    express.static(staticPath, {
        maxAge: config.isProd ? "1y" : 0,
        immutable: config.isProd,
        index: false, // Prevents automatic index.html resolution on directory routes before our SPA fallback
    })
);

/**
 * Single Page Application (SPA) fallback handler.
 *
 * Routes all non-API GET requests to client/dist/index.html with no-cache headers.
 * Uses Express 5 compatible wildcard routing syntax.
 * Unmatched /api routes are forwarded to the centralized notFoundHandler.
 *
 * @name GET {*path}
 * @function
 * @param {import("express").Request}      req  - Express request object.
 * @param {import("express").Response}     res  - Express response object.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {void}
 */
app.get("{*path}", (req, res, next) => {
    // Pass through any unmatched API requests to the 404 handler
    if (req.path.startsWith("/api")) {
        return next();
    }

    const indexPath = path.join(staticPath, "index.html");

    if (fs.existsSync(indexPath)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return res.sendFile(indexPath);
    }

    // Informational fallback when client has not been compiled (e.g., API-only dev mode)
    if (req.path === "/") {
        return res.json({
            message: "Hunting Lodge API is running. Build the frontend client bundle to serve the React SPA.",
            environment: config.env,
            health: "/api/health",
        });
    }

    return next();
});

// === Centralized Error Handling & Fallback 404 Middleware ===
app.use(notFoundHandler);
app.use(errorHandler);

// Start listening for incoming requests
const server = app.listen(config.port, () => {
    console.log(`🚀 Server is running on port ${config.port} [Environment: ${config.env}]`);
    if (fs.existsSync(path.join(staticPath, "index.html"))) {
        console.log(`📦 Serving React SPA static assets from: ${staticPath}`);
    } else {
        console.log(`ℹ️  Static assets directory not found at: ${staticPath} (Client UI will not be served)`);
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

