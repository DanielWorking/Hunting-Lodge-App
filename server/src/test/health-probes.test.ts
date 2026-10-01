/**
 * @module HealthProbesTest
 *
 * Comprehensive unit and integration tests for OpenShift / Kubernetes health probes:
 * - Liveness probe (/healthz): in-memory responsiveness, independent of MongoDB
 * - Readiness probe (/api/health): traffic readiness reflecting DB connectivity
 * - Startup probe (/startup, /api/startup): initial startup check with initialized flag
 * - Rate limiter bypass: ensures high-frequency probe polling never encounters HTTP 429
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express, { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import healthRoutes, {
    livenessHandler,
    readinessHandler,
    startupHandler,
    LivenessResponse,
    ReadinessResponse,
    StartupResponse,
} from "../routes/health";

// Helper to create mock Express Response objects for unit tests
interface MockResponse {
    statusCode: number;
    data: unknown;
    status: (code: number) => MockResponse;
    json: (payload: unknown) => MockResponse;
}

const createMockResponse = (): MockResponse => {
    const res: MockResponse = {
        statusCode: 0,
        data: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.data = payload;
            return this;
        },
    };
    return res;
};

describe("Health Probes - Unit Tests", () => {
    const originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

    const mockReadyState = (state: number): void => {
        Object.defineProperty(mongoose.connection, "readyState", {
            get: () => state,
            configurable: true,
        });
    };

    const restoreReadyState = (): void => {
        if (originalReadyStateDescriptor) {
            Object.defineProperty(mongoose.connection, "readyState", originalReadyStateDescriptor);
        }
    };

    after(() => {
        restoreReadyState();
    });

    describe("GET /healthz (Liveness Probe)", () => {
        it("returns HTTP 200 OK with status UP and uptime regardless of MongoDB state", () => {
            // Force DB state to disconnected to prove liveness does not depend on DB
            mockReadyState(0);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            livenessHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 200);
            const body = mockRes.data as LivenessResponse;
            assert.strictEqual(body.status, "UP");
            assert.strictEqual(typeof body.uptime, "number");
            assert.ok(body.uptime >= 0);
            assert.strictEqual(typeof body.timestamp, "string");
            assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
            assert.strictEqual(typeof body.environment, "string");
        });
    });

    describe("GET /api/health (Readiness Probe)", () => {
        it("returns HTTP 200 OK with status UP when MongoDB readyState === 1", () => {
            mockReadyState(1);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            readinessHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 200);
            const body = mockRes.data as ReadinessResponse;
            assert.strictEqual(body.status, "UP");
            assert.strictEqual(body.database.status, "connected");
            assert.strictEqual(body.database.readyState, 1);
            assert.strictEqual(typeof body.uptime, "number");
            assert.strictEqual(typeof body.timestamp, "string");
        });

        it("returns HTTP 503 Service Unavailable with status DEGRADED when MongoDB readyState === 0", () => {
            mockReadyState(0);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            readinessHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 503);
            const body = mockRes.data as ReadinessResponse;
            assert.strictEqual(body.status, "DEGRADED");
            assert.strictEqual(body.database.status, "disconnected");
            assert.strictEqual(body.database.readyState, 0);
        });

        it("returns HTTP 503 Service Unavailable when MongoDB readyState is 2 (connecting)", () => {
            mockReadyState(2);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            readinessHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 503);
            const body = mockRes.data as ReadinessResponse;
            assert.strictEqual(body.status, "DEGRADED");
            assert.strictEqual(body.database.status, "disconnected");
            assert.strictEqual(body.database.readyState, 2);
        });
    });

    describe("GET /startup & /api/startup (Startup Probe)", () => {
        it("returns HTTP 200 OK with initialized: true when MongoDB readyState === 1", () => {
            mockReadyState(1);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            startupHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 200);
            const body = mockRes.data as StartupResponse;
            assert.strictEqual(body.status, "UP");
            assert.strictEqual(body.initialized, true);
            assert.strictEqual(body.database.status, "connected");
            assert.strictEqual(body.database.readyState, 1);
        });

        it("returns HTTP 503 Service Unavailable with initialized: false when MongoDB readyState === 0", () => {
            mockReadyState(0);

            const mockReq = {} as Request;
            const mockRes = createMockResponse();

            startupHandler(mockReq, mockRes as unknown as Response);

            assert.strictEqual(mockRes.statusCode, 503);
            const body = mockRes.data as StartupResponse;
            assert.strictEqual(body.status, "STARTING");
            assert.strictEqual(body.initialized, false);
            assert.strictEqual(body.database.status, "disconnected");
            assert.strictEqual(body.database.readyState, 0);
        });
    });
});

describe("Health Probes - HTTP Route Integration Tests", () => {
    let server: http.Server;
    let baseUrl: string;

    it("setup server", async () => {
        const app: Express = express();
        app.use(healthRoutes);

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const address = server.address();
                if (address && typeof address === "object") {
                    baseUrl = `http://127.0.0.1:${address.port}`;
                }
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        }
    });

    it("GET /healthz returns 200 OK with correct JSON headers and structure", async () => {
        const res = await fetch(`${baseUrl}/healthz`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get("content-type")?.includes("application/json"), true);

        const data = (await res.json()) as LivenessResponse;
        assert.strictEqual(data.status, "UP");
        assert.ok(typeof data.uptime === "number");
        assert.ok(typeof data.timestamp === "string");
    });

    it("GET /api/health responds with JSON payload and valid status code", async () => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.ok(res.status === 200 || res.status === 503);
        assert.strictEqual(res.headers.get("content-type")?.includes("application/json"), true);

        const data = (await res.json()) as ReadinessResponse;
        assert.ok(data.status === "UP" || data.status === "DEGRADED");
        assert.ok(data.database !== undefined);
    });

    it("GET /startup responds with valid JSON startup response", async () => {
        const res = await fetch(`${baseUrl}/startup`);
        assert.ok(res.status === 200 || res.status === 503);
        assert.strictEqual(res.headers.get("content-type")?.includes("application/json"), true);

        const data = (await res.json()) as StartupResponse;
        assert.ok(typeof data.initialized === "boolean");
        assert.ok(data.status === "UP" || data.status === "STARTING");
    });

    it("GET /api/startup responds with valid JSON startup response", async () => {
        const res = await fetch(`${baseUrl}/api/startup`);
        assert.ok(res.status === 200 || res.status === 503);
        assert.strictEqual(res.headers.get("content-type")?.includes("application/json"), true);

        const data = (await res.json()) as StartupResponse;
        assert.ok(typeof data.initialized === "boolean");
    });
});

describe("Health Probes - Rate Limiter Bypass Integration", () => {
    let server: http.Server;
    let baseUrl: string;

    it("setup server with rate limiter", async () => {
        const app: Express = express();

        // Exact rate limiter pattern configured in app.ts, with a low limit to test bypass
        const limiter = rateLimit({
            windowMs: 60 * 1000,
            max: 3, // Very low threshold to trigger 429 quickly on normal routes
            message: "Too many requests from this IP, please try again after 15 minutes",
            skip: (req) =>
                req.path.startsWith("/api/auth") ||
                req.path === "/api/users/login" ||
                req.path === "/api/health" ||
                req.path === "/healthz" ||
                req.path === "/startup" ||
                req.path === "/api/startup",
        });

        app.use(limiter);
        app.use(healthRoutes);

        // Dummy regular route to demonstrate rate limiter triggers on non-exempt paths
        app.get("/api/normal-endpoint", (_req: Request, res: Response) => {
            res.json({ success: true });
        });

        await new Promise<void>((resolve) => {
            server = app.listen(0, () => {
                const address = server.address();
                if (address && typeof address === "object") {
                    baseUrl = `http://127.0.0.1:${address.port}`;
                }
                resolve();
            });
        });
    });

    after(async () => {
        if (server) {
            await new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        }
    });

    it("normal endpoints are rate limited after exceeding threshold (returns 429)", async () => {
        // Send 3 requests (within limit)
        for (let i = 0; i < 3; i++) {
            const res = await fetch(`${baseUrl}/api/normal-endpoint`);
            assert.strictEqual(res.status, 200);
        }
        // 4th request exceeds max: 3 -> 429 Too Many Requests
        const blockedRes = await fetch(`${baseUrl}/api/normal-endpoint`);
        assert.strictEqual(blockedRes.status, 429);
    });

    it("/healthz bypasses rate limiting across consecutive probe polling cycles", async () => {
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${baseUrl}/healthz`);
            assert.strictEqual(res.status, 200, `Request ${i + 1} should not be rate-limited`);
        }
    });

    it("/api/health bypasses rate limiting across consecutive probe polling cycles", async () => {
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${baseUrl}/api/health`);
            assert.notStrictEqual(res.status, 429, `Request ${i + 1} should bypass rate limit`);
        }
    });

    it("/startup and /api/startup bypass rate limiting", async () => {
        for (let i = 0; i < 10; i++) {
            const resRoot = await fetch(`${baseUrl}/startup`);
            assert.notStrictEqual(resRoot.status, 429);

            const resApi = await fetch(`${baseUrl}/api/startup`);
            assert.notStrictEqual(resApi.status, 429);
        }
    });
});
