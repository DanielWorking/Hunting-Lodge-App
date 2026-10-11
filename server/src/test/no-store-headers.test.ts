import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Request, Response, NextFunction } from "express";

import sitesRouter from "../routes/sites";
import phonesRouter from "../routes/phones";
import { noStore } from "../middleware/cacheMiddleware";

const NO_STORE = "no-store, no-cache, must-revalidate, private";

describe("noStore middleware", () => {
    it("sets no-store cache headers that stop browsers and proxies from reusing a response", () => {
        const headers: Record<string, string> = {};
        const res = {
            setHeader(name: string, value: string) {
                headers[name] = value;
            },
        };
        let calls = 0;
        const next = (() => {
            calls++;
        }) as NextFunction;

        noStore({} as Request, res as unknown as Response, next);

        assert.equal(headers["Cache-Control"], NO_STORE);
        assert.equal(headers["Pragma"], "no-cache");
        assert.equal(headers["Expires"], "0");
        assert.equal(calls, 1, "middleware must call next()");
    });
});

describe("site and phone routers send no-store headers on every response", () => {
    const app = express();
    app.use("/api/sites", sitesRouter);
    app.use("/api/phones", phonesRouter);

    let server: http.Server;
    let base: string;

    before(async () => {
        server = app.listen(0, "127.0.0.1");
        await new Promise<void>((resolve) => server.once("listening", () => resolve()));
        const { port } = server.address() as AddressInfo;
        base = `http://127.0.0.1:${port}`;
    });

    after(async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    // Unauthenticated requests are rejected by protect() before any database access,
    // so these checks run without MongoDB and still cover the router-level header wiring.
    it("GET /api/sites carries no-store even when the request is rejected", async () => {
        const res = await fetch(`${base}/api/sites`);
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("cache-control"), NO_STORE);
        assert.equal(res.headers.get("pragma"), "no-cache");
    });

    it("PUT /api/sites/:id carries no-store", async () => {
        const res = await fetch(`${base}/api/sites/abc123`, { method: "PUT" });
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("cache-control"), NO_STORE);
    });

    it("GET /api/phones carries no-store even when the request is rejected", async () => {
        const res = await fetch(`${base}/api/phones`);
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("cache-control"), NO_STORE);
        assert.equal(res.headers.get("pragma"), "no-cache");
    });

    it("PUT /api/phones/:id carries no-store", async () => {
        const res = await fetch(`${base}/api/phones/abc123`, { method: "PUT" });
        assert.equal(res.status, 401);
        assert.equal(res.headers.get("cache-control"), NO_STORE);
    });
});
