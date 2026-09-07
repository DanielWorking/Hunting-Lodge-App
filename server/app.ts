/**
 * @module App
 *
 * Express application configuration and middleware pipeline for Hunting Lodge.
 * Configures security headers, CORS, request parsing, rate limiting,
 * API routes, static asset serving, SPA fallback, and centralized error handling.
 */

import path from "path";
import fs from "fs";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import mongoose from "mongoose";
import config from "./src/config";
import authRoutes from "./src/routes/auth";
import sitesRoutes from "./src/routes/sites";
import phonesRoutes from "./src/routes/phones";
import groupsRoutes from "./src/routes/groups";
import usersRoutes from "./src/routes/users";
import schedulesRoutes from "./src/routes/schedules";
import reportsRoutes from "./src/routes/reports";
import { notFoundHandler, errorHandler } from "./src/middleware/errorMiddleware";
import { stripImmutableFields } from "./src/middleware/sanitizationMiddleware";

const app: Express = express();

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

interface HealthCheckResponse {
    readonly status: "UP" | "DEGRADED";
    readonly timestamp: string;
    readonly uptime: number;
    readonly environment: string;
    readonly database: {
        readonly status: "connected" | "disconnected";
        readonly readyState: number;
    };
}

/**
 * Health check handler for OpenShift / Kubernetes liveness and readiness probes.
 * Checks database readiness state and returns system uptime and timestamp.
 */
const healthHandler = (_req: Request, res: Response): void => {
    const isDbConnected: boolean = mongoose.connection.readyState === 1;
    const status: "UP" | "DEGRADED" = isDbConnected ? "UP" : "DEGRADED";
    const statusCode: number = isDbConnected ? 200 : 503;

    const responseData: HealthCheckResponse = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: {
            status: isDbConnected ? "connected" : "disconnected",
            readyState: mongoose.connection.readyState,
        },
    };

    res.status(statusCode).json(responseData);
};

// Register OpenShift / Kubernetes health probe endpoints
app.get("/api/health", healthHandler);
app.get("/healthz", healthHandler);

// === API Route Definitions ===
app.use("/api/sites", sitesRoutes);
app.use("/api/phones", phonesRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/schedules", schedulesRoutes);
app.use("/api/reports", reportsRoutes);

// SSO Authentication Routes
app.use("/api/auth", authRoutes);

// === Static Asset Serving & React SPA Fallback (Production & Container Deployments) ===
const staticPath: string = config.staticFilesPath;

// Serve pre-built static assets (Vite hashed bundles, robots.txt, images, fonts)
app.use(
    express.static(staticPath, {
        maxAge: config.isProd ? "1y" : 0,
        immutable: config.isProd,
        index: false, // Prevents automatic index.html resolution on directory routes before our SPA fallback
        setHeaders: (res: Response, filePath: string): void => {
            // robots.txt should not be cached aggressively with 1y immutable header
            if (filePath.endsWith("robots.txt")) {
                res.setHeader("Cache-Control", "public, max-age=86400");
            }
        },
    })
);

/**
 * Single Page Application (SPA) fallback handler.
 * Routes all non-API GET requests to client/dist/index.html with no-cache headers.
 * Uses Express 5 compatible wildcard routing syntax.
 * Unmatched /api routes are forwarded to the centralized notFoundHandler.
 */
app.get("{*path}", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Pass through any unmatched API requests to the 404 handler
    if (req.path.startsWith("/api")) {
        return next();
    }

    const indexPath: string = path.join(staticPath, "index.html");

    try {
        await fs.promises.access(indexPath, fs.constants.F_OK);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.sendFile(indexPath);
    } catch {
        // Informational fallback when client has not been compiled (e.g., API-only dev mode)
        if (req.path === "/") {
            res.json({
                message: "Hunting Lodge API is running. Build the frontend client bundle to serve the React SPA.",
                environment: config.env,
                health: "/api/health",
            });
            return;
        }
        return next();
    }
});

// === Centralized Error Handling & Fallback 404 Middleware ===
app.use(notFoundHandler);
app.use(errorHandler);

export = app;