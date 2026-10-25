/**
 * @module App
 *
 * Express application configuration and middleware pipeline for Hunting Lodge.
 * Configures security headers, CORS, request parsing, rate limiting,
 * API routes, static asset serving, SPA fallback, and centralized error handling.
 */

import path from "path";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import createCorsOptions from "./src/config/corsOptions";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import config from "./src/config";
import healthRoutes from "./src/routes/health";
import authRoutes from "./src/routes/auth";
import sitesRoutes from "./src/routes/sites";
import phonesRoutes from "./src/routes/phones";
import groupsRoutes from "./src/routes/groups";
import usersRoutes from "./src/routes/users";
import schedulesRoutes from "./src/routes/schedules";
import reportsRoutes from "./src/routes/reports";
import { notFoundHandler, createErrorHandler } from "./src/middleware/errorMiddleware";
import { stripImmutableFields } from "./src/middleware/sanitizationMiddleware";
import { createGlobalRateLimiter } from "./src/middleware/rateLimitMiddleware";

const app: Express = express();

// Configure reverse proxy trust for correct client IP resolution behind proxies (OpenShift Router, Nginx, ALB)
app.set("trust proxy", config.security.trustProxy);

// Response payload compression for payloads > 1KB (gzip / deflate)
app.use(
    compression({
        threshold: 1024,
    })
);

// Global Middleware setup
app.use(morgan(config.logging.morganFormat)); // HTTP request logger (dev vs combined)

// Secure HTTP headers with tailored Content Security Policy (CSP) for React, Material-UI & Google Fonts
const configuredOrigins = typeof config.security.corsOrigin === "string"
    ? config.security.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: [
                    "'self'",
                    config.sso.issuerUrl ? config.sso.issuerUrl : "",
                    ...configuredOrigins,
                ].filter(Boolean),
                objectSrc: ["'none'"],
                // Keyed on transport, not environment name: upgrade whenever the app is served over
                // HTTPS (every deployment, nonprod included); only local http://localhost runs without it
                upgradeInsecureRequests: config.sso.redirectUri.startsWith("https://") ? [] : null,
            },
        },
    })
);

// CORS configuration: dynamic whitelist resolution tailored per environment
app.use(cors(createCorsOptions(config.appEnv, config.security.corsOrigin)));

// Lightweight native cookie parsing middleware to populate req.cookies
app.use((req: Request, _res: Response, next: NextFunction): void => {
    const rawCookies = req.headers.cookie;
    const parsedCookies: Record<string, string> = {};

    if (rawCookies && typeof rawCookies === "string") {
        const pairs = rawCookies.split(";");
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const eqIdx = pair.indexOf("=");
            if (eqIdx !== -1) {
                const key = pair.substring(0, eqIdx).trim();
                const rawVal = pair.substring(eqIdx + 1).trim();
                if (key && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
                    try {
                        parsedCookies[key] = decodeURIComponent(rawVal);
                    } catch {
                        parsedCookies[key] = rawVal;
                    }
                }
            }
        }
    }

    req.cookies = parsedCookies;
    next();
});

app.use(express.json());
app.use(stripImmutableFields);

// Defense-in-depth CSRF guard: block cross-site mutating requests on state-changing API endpoints
app.use((req: Request, res: Response, next: NextFunction): void => {
    const isMutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
    if (isMutating && req.path.startsWith("/api/")) {
        // Exempt public OIDC callback/exchange endpoints
        if (req.path === "/api/auth/login" || req.path === "/api/auth/sso-url") {
            return next();
        }
        const secFetchSite = req.headers["sec-fetch-site"];
        if (secFetchSite === "cross-site") {
            res.status(403).json({ message: "Cross-site request blocked", code: "CSRF_DETECTED" });
            return;
        }
    }
    next();
});

// Apply rate limiting to API requests (JSON 429 bodies); skips auth paths and OpenShift probe polling endpoints
app.use(
    createGlobalRateLimiter({
        windowMs: config.security.rateLimitWindowMs,
        max: config.security.rateLimitMax,
    })
);

// Register OpenShift / Kubernetes health probe endpoints
app.use(healthRoutes);

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
        // Same caching in every environment: Vite bundles are content-hashed, so they are immutable
        maxAge: "1y",
        immutable: true,
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
app.get("{*path}", (req: Request, res: Response, next: NextFunction): void => {
    // Pass through any unmatched API requests to the 404 handler
    if (req.path.startsWith("/api")) {
        return next();
    }

    const indexPath: string = path.join(staticPath, "index.html");

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    res.sendFile(indexPath, (err?: Error) => {
        if (err) {
            if (res.headersSent) {
                return;
            }
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
});

// === Centralized Error Handling & Fallback 404 Middleware ===
app.use(notFoundHandler);
// 5xx bodies carry `details` only where EXPOSE_ERROR_DETAILS is on (nonprod; refused elsewhere)
app.use(createErrorHandler({ exposeErrorDetails: config.security.exposeErrorDetails }));

export default app;