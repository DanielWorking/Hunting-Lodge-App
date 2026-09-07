import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import app from "../../app";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import User from "../models/User";
import Group from "../models/Group";
import Site from "../models/Site";
import mongoose from "mongoose";
import { validateRequest } from "../middleware/validationMiddleware";
import { z } from "zod";

interface ValidationErrorItem {
    field: string;
    message?: string;
}

interface ApiErrorResponse {
    code: string;
    message?: string;
    errors?: ValidationErrorItem[];
    stack?: unknown;
}

describe("Migrated TypeScript API Routes & Schema Validation Suite", () => {
    let server: http.Server;
    let baseUrl: string;

    before(async () => {
        await new Promise<void>((resolve) => {
            server = http.createServer(app);
            server.listen(0, "127.0.0.1", () => {
                const address = server.address() as AddressInfo;
                baseUrl = `http://127.0.0.1:${address.port}`;
                resolve();
            });
        });
    });

    after(async () => {
        await new Promise<void>((resolve) => {
            if (server) {
                server.close(() => resolve());
            } else {
                resolve();
            }
        });
    });

    describe("Authentication & Public Endpoint Guardrails", () => {
        it("POST /api/auth/login rejects empty payload with 400 and standardized VALIDATION_ERROR", async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const data = (await res.json()) as ApiErrorResponse;

            assert.equal(res.status, 400, "Expected 400 Bad Request");
            assert.equal(data.code, "VALIDATION_ERROR");
            assert.ok(Array.isArray(data.errors));
            assert.ok(data.errors.some((e) => e.field === "code"));
        });

        it("POST /api/auth/login rejects whitespace-only code with 400 and VALIDATION_ERROR", async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: "   " }),
            });
            const data = (await res.json()) as ApiErrorResponse;

            assert.equal(res.status, 400);
            assert.equal(data.code, "VALIDATION_ERROR");
        });

        it("GET /api/auth/me rejects unauthenticated requests with 401", async () => {
            const res = await fetch(`${baseUrl}/api/auth/me`);
            assert.equal(res.status, 401, "Expected 401 Unauthorized for unauthenticated GET /me");
        });

        it("POST /api/users/login rejects empty payload with 400 and VALIDATION_ERROR", async () => {
            const res = await fetch(`${baseUrl}/api/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const data = (await res.json()) as ApiErrorResponse;

            assert.equal(res.status, 400);
            assert.equal(data.code, "VALIDATION_ERROR");
            assert.ok(Array.isArray(data.errors));
            assert.ok(data.errors.some((e) => e.field === "username"));
        });
    });

    describe("Protected Route Authentication Enforcement", () => {
        it("GET /api/users is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/users`);
            assert.equal(res.status, 401);
        });

        it("PUT /api/users/reorder/group is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/users/reorder/group`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: "test-group", updates: [{ userId: "u1", order: 1 }] }),
            });
            assert.equal(res.status, 401);
        });

        it("GET /api/groups is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/groups`);
            assert.equal(res.status, 401);
        });

        it("POST /api/groups is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/groups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "New Group" }),
            });
            assert.equal(res.status, 401);
        });

        it("GET /api/schedules is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/schedules?groupId=g1&date=2026-09-01`);
            assert.equal(res.status, 401);
        });

        it("PUT /api/schedules is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/schedules`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId: "g1" }),
            });
            assert.equal(res.status, 401);
        });

        it("GET /api/reports is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/reports?groupId=g1`);
            assert.equal(res.status, 401);
        });

        it("GET /api/sites is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/sites`);
            assert.equal(res.status, 401);
        });

        it("GET /api/phones is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/phones`);
            assert.equal(res.status, 401);
        });

        it("POST /api/phones is gated by authentication (401 without token)", async () => {
            const res = await fetch(`${baseUrl}/api/phones`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "HQ", numbers: ["555-0100"] }),
            });
            assert.equal(res.status, 401);
        });
    });

    describe("Information Leakage & Error Sanitization", () => {
        it("Validation errors do not expose stack traces or internal DB details", async () => {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ malformed: true }),
            });
            const data = (await res.json()) as ApiErrorResponse;

            assert.equal(res.status, 400);
            assert.equal(data.code, "VALIDATION_ERROR");
            assert.equal(typeof data.message, "string");
            assert.strictEqual(data.stack, undefined);
            assert.ok(!JSON.stringify(data).includes("mongo"));
            assert.ok(!JSON.stringify(data).includes("mongoose"));
        });
    });

    describe("Express v5 req.query Setter & Super Admin Claims Regressions", () => {
        it("validateRequest must not throw TypeError on getter-only req.query (Express v5 constraint)", async () => {
            let queryVal: Record<string, unknown> = { tag: "General", extra: "dropped" };
            const fakeReq = Object.create({}, {
                query: {
                    get() {
                        return queryVal;
                    },
                    enumerable: true,
                    configurable: true,
                },
                params: { value: {}, writable: true, enumerable: true, configurable: true },
                body: { value: {}, writable: true, enumerable: true, configurable: true },
            });

            const schema = z.object({
                tag: z.string(),
            });

            const middleware = validateRequest({ query: schema });
            let nextCalled = false;
            let capturedError: unknown = null;

            await middleware(
                fakeReq,
                {} as unknown as Response,
                (err?: unknown) => {
                    if (err) capturedError = err;
                    else nextCalled = true;
                }
            );

            assert.equal(capturedError, null, `Middleware threw error: ${String(capturedError)}`);
            assert.equal(nextCalled, true, "next() should have been called successfully");
            assert.equal(fakeReq.query?.tag, "General");
        });

        it("GET /api/sites with query params succeeds without Express v5 query setter crash", async () => {
            const adminId = new mongoose.Types.ObjectId().toString();
            const token = jwt.sign(
                { userId: adminId, username: config.superAdmin.id },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const userHolder = User as unknown as Record<string, unknown>;
            const siteHolder = Site as unknown as Record<string, unknown>;
            const origUserFindById = userHolder.findById;
            const origSiteFind = siteHolder.find;

            userHolder.findById = () => ({
                populate: async () => ({
                    _id: adminId,
                    username: config.superAdmin.id,
                    email: config.superAdmin.email || "admin@example.com",
                    isActive: true,
                    groups: [],
                }),
            });

            siteHolder.find = async () => [
                { _id: new mongoose.Types.ObjectId(), title: "Test Site", tag: "General", url: "https://example.com" }
            ];

            try {
                const res = await fetch(`${baseUrl}/api/sites?tag=General`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
                const data = (await res.json()) as unknown[];
                assert.ok(Array.isArray(data));
            } finally {
                userHolder.findById = origUserFindById;
                siteHolder.find = origSiteFind;
            }
        });

        it("GET /api/users?groupId=... succeeds without Express v5 query setter crash", async () => {
            const adminId = new mongoose.Types.ObjectId().toString();
            const groupId = new mongoose.Types.ObjectId().toString();
            const token = jwt.sign(
                { userId: adminId, username: config.superAdmin.id },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;
            const origUserFindById = userHolder.findById;
            const origUserFind = userHolder.find;
            const origGroupFindById = groupHolder.findById;

            userHolder.findById = () => ({
                populate: async () => ({
                    _id: adminId,
                    username: config.superAdmin.id,
                    email: config.superAdmin.email || "admin@example.com",
                    isActive: true,
                    groups: [],
                }),
            });

            groupHolder.findById = async () => ({
                _id: groupId,
                name: "noc",
            });

            userHolder.find = async () => [
                { _id: adminId, username: config.superAdmin.id, displayName: "Admin", groups: [] }
            ];

            try {
                const res = await fetch(`${baseUrl}/api/users?groupId=${groupId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
                const data = (await res.json()) as unknown[];
                assert.ok(Array.isArray(data));
            } finally {
                userHolder.findById = origUserFindById;
                userHolder.find = origUserFind;
                groupHolder.findById = origGroupFindById;
            }
        });

        it("GET /api/auth/me returns Super Admin profile with ADMINISTRATORS group claims", async () => {
            const adminId = new mongoose.Types.ObjectId().toString();
            const token = jwt.sign(
                { userId: adminId, username: config.superAdmin.id },
                config.jwt.secret,
                { expiresIn: "1h" }
            );

            const userHolder = User as unknown as Record<string, unknown>;
            const groupHolder = Group as unknown as Record<string, unknown>;
            const origUserFindById = userHolder.findById;
            const origGroupFindOne = groupHolder.findOne;

            userHolder.findById = () => ({
                populate: async () => ({
                    _id: adminId,
                    username: config.superAdmin.id,
                    displayName: config.superAdmin.username,
                    email: config.superAdmin.email || "admin@example.com",
                    isActive: true,
                    groups: [],
                    toObject: () => ({
                        _id: adminId,
                        username: config.superAdmin.id,
                        displayName: config.superAdmin.username,
                        email: config.superAdmin.email || "admin@example.com",
                        isActive: true,
                        groups: [],
                    }),
                }),
            });

            const adminGroupId = new mongoose.Types.ObjectId();
            groupHolder.findOne = async () => ({
                _id: adminGroupId,
                name: config.superAdmin.groupName,
            });

            try {
                const res = await fetch(`${baseUrl}/api/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
                const user = (await res.json()) as { groups?: Array<{ groupId: unknown; groupName?: string; name?: string; role?: string }> };
                assert.ok(Array.isArray(user.groups), "Expected groups array in /api/auth/me");
                const hasAdminGroup = user.groups.some((g) => {
                    const gid = typeof g.groupId === "object" && g.groupId !== null ? (g.groupId as { name?: string }).name : String(g.groupId);
                    return gid === config.superAdmin.groupName || g.groupName === config.superAdmin.groupName || g.name === config.superAdmin.groupName;
                });
                assert.ok(hasAdminGroup, `Expected user to contain ${config.superAdmin.groupName} group claim`);
            } finally {
                userHolder.findById = origUserFindById;
                groupHolder.findOne = origGroupFindOne;
            }
        });
    });
});
