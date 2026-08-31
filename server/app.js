/**
 * @module App
 *
 * Express application configuration and middleware pipeline for Hunting Lodge.
 * Configures security headers, CORS, request parsing, rate limiting,
 * API routes, static asset serving, SPA fallback, and centralized error handling.
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
const { stripImmutableFields } = require("./middleware/sanitizationMiddleware");

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
app.use(stripImmutableFields);

// Apply rate limiting to all requests based on environment configuration
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use(limiter);

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

// Serve pre-built static assets (Vite hashed bundles, robots.txt, images, fonts)
app.use(
    express.static(staticPath, {
        maxAge: config.isProd ? "1y" : 0,
        immutable: config.isProd,
        index: false, // Prevents automatic index.html resolution on directory routes before our SPA fallback
        setHeaders: (res, filePath) => {
            // robots.txt should not be cached aggressively with 1y immutable header
            if (filePath.endsWith("robots.txt")) {
                res.setHeader("Cache-Control", "public, max-age=86400");
            }
        },
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

module.exports = app;
