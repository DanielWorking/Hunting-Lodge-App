/**
 * @module HealthRoutes
 *
 * Dedicated OpenShift / Kubernetes health probe endpoints.
 * Provides distinct liveness, readiness, and startup probe handlers
 * with zero-overhead in-memory status checks.
 */

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import config from "../config";

/**
 * Response payload structure for Kubernetes / OpenShift liveness probe (/healthz).
 */
export interface LivenessResponse {
    readonly status: "UP";
    readonly timestamp: string;
    readonly uptime: number;
    readonly environment: string;
}

/**
 * Database health details within readiness and startup probe responses.
 */
export interface DatabaseHealthStatus {
    readonly status: "connected" | "disconnected";
    readonly readyState: number;
}

/**
 * Response payload structure for Kubernetes / OpenShift readiness probe (/api/health).
 */
export interface ReadinessResponse {
    readonly status: "UP" | "DEGRADED";
    readonly timestamp: string;
    readonly uptime: number;
    readonly environment: string;
    readonly database: DatabaseHealthStatus;
}

/**
 * Response payload structure for Kubernetes / OpenShift startup probe (/startup, /api/startup).
 */
export interface StartupResponse {
    readonly status: "UP" | "STARTING";
    readonly initialized: boolean;
    readonly timestamp: string;
    readonly uptime: number;
    readonly environment: string;
    readonly database: DatabaseHealthStatus;
}

/**
 * Liveness probe handler.
 * Purely non-blocking in-memory process check.
 * Deliberately does NOT query MongoDB so temporary database hiccups
 * or connection pool exhaustion do not cause Kubernetes to kill and restart healthy application containers.
 */
export const livenessHandler = (_req: Request, res: Response): void => {
    const response: LivenessResponse = {
        status: "UP",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
    };
    res.status(200).json(response);
};

/**
 * Readiness probe handler.
 * Inspects mongoose.connection.readyState === 1 in-memory without DB queries or pool acquisition.
 * Returns HTTP 200 OK ("UP") when connected to serve traffic,
 * or HTTP 503 Service Unavailable ("DEGRADED") when disconnected to detach pod from OpenShift Service endpoints.
 */
export const readinessHandler = (_req: Request, res: Response): void => {
    const isDbConnected: boolean = mongoose.connection.readyState === 1;
    const status: "UP" | "DEGRADED" = isDbConnected ? "UP" : "DEGRADED";
    const statusCode: number = isDbConnected ? 200 : 503;

    const response: ReadinessResponse = {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: {
            status: isDbConnected ? "connected" : "disconnected",
            readyState: mongoose.connection.readyState,
        },
    };
    res.status(statusCode).json(response);
};

/**
 * Startup probe handler.
 * Inspects mongoose.connection.readyState === 1 in-memory.
 * Returns HTTP 200 OK ("UP", initialized: true) when initialization and initial DB connection succeed,
 * or HTTP 503 Service Unavailable ("STARTING", initialized: false) while application bootstrap is in progress.
 */
export const startupHandler = (_req: Request, res: Response): void => {
    const isDbConnected: boolean = mongoose.connection.readyState === 1;
    const status: "UP" | "STARTING" = isDbConnected ? "UP" : "STARTING";
    const statusCode: number = isDbConnected ? 200 : 503;

    const response: StartupResponse = {
        status,
        initialized: isDbConnected,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: {
            status: isDbConnected ? "connected" : "disconnected",
            readyState: mongoose.connection.readyState,
        },
    };
    res.status(statusCode).json(response);
};

const router = Router();

// Liveness probe (process responsiveness)
router.get("/healthz", livenessHandler);

// Readiness probe (traffic routing readiness based on DB state)
router.get("/api/health", readinessHandler);

// Startup probe (container startup lifecycle)
router.get("/startup", startupHandler);
router.get("/api/startup", startupHandler);

export default router;
