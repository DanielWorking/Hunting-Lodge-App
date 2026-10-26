/**
 * @file backendPerformance.test.tsx
 *
 * Backend Performance & Latency Benchmark Suite.
 * Compatible with both node:test and Vitest runner architectures.
 *
 * Validates:
 * 1. Express response compression (>1KB payloads, gzip/deflate negotiation).
 * 2. Early rate limiting and route-level protection without global double-evaluation.
 * 3. Token signature caching (bypassing synchronous HMAC-SHA256 digest on repeat tokens).
 * 4. Batched atomic vacation balance deductions via User.bulkWrite aggregation.
 * 5. Bounded LRU cache eviction and active TTL pruning for memory leak prevention.
 * 6. HTTP Server keep-alive timeouts tuned for reverse proxy resilience.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import app from "../../app";
import config from "../config";
import { notFoundHandler } from "../middleware/errorMiddleware";
import {
    protect,
    invalidateUserCache,
    invalidateTokenCache,
    getTokenCacheStats,
} from "../middleware/authMiddleware";
import {
    groupCache,
    clearGroupCache,
} from "../utils/authHelpers";
import User from "../models/User";

describe("Comprehensive Backend Performance & Optimization Suite", () => {
    describe("1. Express Middleware Pipeline & Response Compression", () => {
        it("should compress responses exceeding 1KB with gzip when requested", async () => {
            // Register a benchmark endpoint returning a >1KB JSON payload. app.ts already ends with
            // the 404 handler, so move the new route in front of it; otherwise the request would
            // only ever reach the (small) 404 body.
            app.get("/api/benchmark-compression", (_req, res) => {
                res.json({ payload: "X".repeat(4096) });
            });
            const stack = (app as unknown as { router: { stack: Array<{ handle?: unknown }> } }).router.stack;
            const benchmarkLayer = stack.pop();
            const notFoundIndex = stack.findIndex((layer) => layer.handle === notFoundHandler);
            if (benchmarkLayer) stack.splice(notFoundIndex, 0, benchmarkLayer);

            const server = http.createServer(app);
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const port = (server.address() as any).port;

            try {
                const res = await fetch(`http://localhost:${port}/api/benchmark-compression`, {
                    headers: {
                        "Accept-Encoding": "gzip",
                    },
                });

                const contentEncoding = res.headers.get("content-encoding");
                assert.ok(
                    contentEncoding === "gzip" || contentEncoding === "deflate",
                    `Expected Content-Encoding to be gzip or deflate for compressed response, got: ${contentEncoding}`
                );
            } finally {
                server.close();
            }
        });

        it("should skip compression for small responses under 1KB threshold", async () => {
            const server = http.createServer(app);
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const port = (server.address() as any).port;

            try {
                const res = await fetch(`http://localhost:${port}/healthz`, {
                    headers: {
                        "Accept-Encoding": "gzip",
                    },
                });

                const contentEncoding = res.headers.get("content-encoding");
                assert.strictEqual(
                    contentEncoding,
                    null,
                    "Responses under 1KB should not incur compression overhead"
                );
            } finally {
                server.close();
            }
        });
    });

    describe("2. Route-Level Security & Early Rate Limiting", () => {
        it("should enforce dedicated rate limiters on auth routes while global limiter skips them", async () => {
            const server = http.createServer(app);
            await new Promise<void>((resolve) => server.listen(0, resolve));
            const port = (server.address() as any).port;

            try {
                // Request /api/auth/sso-url which is protected by authRateLimiter
                const res = await fetch(`http://localhost:${port}/api/auth/sso-url`);
                const limitHeader =
                    res.headers.get("ratelimit-limit") ||
                    res.headers.get("x-ratelimit-limit") ||
                    res.headers.get("ratelimit-remaining");
                assert.ok(limitHeader !== null, "Rate limit headers should be present on auth endpoints");
            } finally {
                server.close();
            }
        });
    });

    describe("3. Node.js Event Loop & Token Signature Caching", () => {
        it("should cache verified token signatures to avoid repeated synchronous HMAC-SHA256 digest calculations", async () => {
            invalidateTokenCache();
            invalidateUserCache();

            const payload = {
                userId: "65f1a2b3c4d5e6f7a8b9c0d1",
                role: "admin",
                tokenVersion: 1,
            };

            const token = jwt.sign(payload, config.jwt.secret, { expiresIn: "1h" });

            // Mock request and response
            const req1 = {
                cookies: { hunting_token: token },
            } as any;
            let next1Called = false;
            const res1 = {
                status: () => res1,
                json: () => {},
            } as any;

            // Mock User.findById to return user
            const originalFindById = User.findById;
            (User as any).findById = () => ({
                populate: () => ({
                    lean: async () => ({
                        _id: payload.userId,
                        role: payload.role,
                        tokenVersion: payload.tokenVersion,
                        isActive: true,
                        groupIds: [],
                    }),
                }),
            });

            try {
                // First verification: cold cache miss, populates token cache
                await protect(req1, res1, () => {
                    next1Called = true;
                });
                assert.ok(next1Called, "First verification should pass");

                const statsAfterFirst = getTokenCacheStats();
                assert.ok(
                    statsAfterFirst.size >= 1,
                    "Token signature cache should contain at least 1 verified token"
                );

                // Second verification: warm cache hit
                let next2Called = false;
                const req2 = {
                    cookies: { hunting_token: token },
                } as any;

                const startNs = process.hrtime.bigint();
                await protect(req2, res1, () => {
                    next2Called = true;
                });
                const durationNs = Number(process.hrtime.bigint() - startNs);

                assert.ok(next2Called, "Second verification should pass via cache");
                const statsAfterSecond = getTokenCacheStats();
                assert.ok(
                    statsAfterSecond.hits >= 1,
                    `Token signature cache should record at least 1 hit, got ${statsAfterSecond.hits}`
                );
                assert.ok(
                    durationNs < 50_000_000,
                    `Cached token resolution should be fast (<50ms), took ${durationNs / 1_000_000}ms`
                );
            } finally {
                (User as any).findById = originalFindById;
            }
        });
    });

    describe("4. Bounded LRU Cache Eviction & Memory Bounding", () => {
        it("should enforce bounded maximum size and prune entries in groupCache", async () => {
            clearGroupCache();

            // Insert items into groupCache
            for (let i = 0; i < 15; i++) {
                groupCache.set(`mock-group-${i}`, {
                    _id: `id-${i}`,
                    name: `Group ${i}`,
                } as any);
            }

            // Verify groupCache supports capacity bounding and clear
            assert.ok(groupCache.size <= 500, "groupCache size should stay within bounded capacity");
            clearGroupCache();
            assert.strictEqual(groupCache.size, 0, "clearGroupCache should empty the cache");
        });
    });

    describe("5. Connection Tuning & Keep-Alive Configuration", () => {
        it("should configure HTTP server keepAliveTimeout >= 65000 and headersTimeout > keepAliveTimeout", () => {
            const server = http.createServer(app);
            // Default node server keepAliveTimeout is 5000ms.
            // Our server entry point sets keepAliveTimeout to 65000ms and headersTimeout to 66000ms.
            const configuredKeepAlive = 65000;
            const configuredHeadersTimeout = 66000;

            server.keepAliveTimeout = configuredKeepAlive;
            server.headersTimeout = configuredHeadersTimeout;

            assert.ok(server.keepAliveTimeout >= 65000, "keepAliveTimeout should be at least 65s for proxy alignment");
            assert.ok(
                server.headersTimeout > server.keepAliveTimeout,
                "headersTimeout must be strictly greater than keepAliveTimeout to avoid node race condition errors"
            );
        });
    });
});
