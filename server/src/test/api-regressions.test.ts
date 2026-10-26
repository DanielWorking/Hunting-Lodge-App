/**
 * @module ApiRegressionTests
 *
 * Regression tests for API behaviour: phone numbers and favorites, route validation, schedule
 * saving, publishing and lookup, user responses, group tags, vacation balance visibility, logout,
 * report deletion, error codes, group guards and rate limiting. One describe block per behaviour.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express, { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Issuer } from "openid-client";

import config from "../config";
import ssoConfig from "../config/sso";
import User, { toPublicUser } from "../models/User";
import Group from "../models/Group";
import Phone from "../models/Phone";
import Site from "../models/Site";
import ShiftSchedule from "../models/ShiftSchedule";
import ShiftReport from "../models/ShiftReport";

import * as phonesController from "../controllers/phonesController";
import * as schedulesController from "../controllers/schedulesController";
import * as groupsController from "../controllers/groupsController";
import * as usersController from "../controllers/usersController";
import * as reportsController from "../controllers/reportsController";
import * as authController from "../controllers/authController";

import { createPhoneSchema } from "../routes/phones";
import { createReportSchema } from "../routes/reports";
import { saveScheduleSchema } from "../routes/schedules";
import { groupIdParamSchema, renameTagSchema, deleteTagQuerySchema } from "../routes/groups";
import sitesRouter from "../routes/sites";
import phonesRouter from "../routes/phones";
import reportsRouter from "../routes/reports";
import groupsRouter from "../routes/groups";

import { validateRequest } from "../middleware/validationMiddleware";
import { errorHandler } from "../middleware/errorMiddleware";
import { requireGroupMember, requireShiftManager } from "../middleware/authMiddleware";
import { createGlobalRateLimiter } from "../middleware/rateLimitMiddleware";
import { clearGroupCache } from "../utils/authHelpers";
import { generateToken } from "../utils/jwt";

// --- Test harness -----------------------------------------------------------

interface MockRes {
    statusCode: number;
    body: Record<string, unknown> | unknown[] | null;
    status: (code: number) => MockRes;
    json: (data: Record<string, unknown> | unknown[] | null) => MockRes;
    clearCookie: () => MockRes;
}

function createMockRes(): MockRes {
    return {
        statusCode: 200,
        body: null,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        clearCookie() {
            return this;
        },
    };
}

function bodyOf(res: MockRes): Record<string, unknown> {
    return (res.body ?? {}) as Record<string, unknown>;
}

const restores: Array<() => void> = [];

/** Replaces `target[key]` for the current test; restored automatically in afterEach. */
function patch(target: unknown, key: string, value: unknown): void {
    const holder = target as Record<string, unknown>;
    const original = holder[key];
    holder[key] = value;
    restores.push(() => {
        holder[key] = original;
    });
}

afterEach(() => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
    clearGroupCache();
});

const newId = (): string => new mongoose.Types.ObjectId().toString();

/** Resolves a fake group by id (findById) or name (findOne), as resolveGroup does. */
function mockGroupLookup(group: Record<string, unknown> | null): void {
    patch(Group, "findById", async (id: unknown) => (group && String(group._id) === String(id) ? group : null));
    patch(Group, "findOne", async (filter: { name?: string }) => (group && filter?.name === group.name ? group : null));
}

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
    const server: http.Server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    try {
        await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
}

async function runValidation(schemas: Parameters<typeof validateRequest>[0], req: Partial<Request>): Promise<{ res: MockRes; passed: boolean }> {
    const res = createMockRes();
    let passed = false;
    await validateRequest(schemas)(req as Request, res as unknown as Response, () => {
        passed = true;
    });
    return { res, passed };
}

// --- Duplicate phone numbers ------------------------------------------------

describe("duplicate phone number answers 409, not 500", () => {
    it("createPhone responds 409 DUPLICATE_PHONE_NUMBER naming the conflicting contact", async () => {
        patch(Phone, "findOne", async () => ({ name: "Front Desk", numbers: ["050-1234567"] }));
        const req = { body: { name: "New", numbers: ["050-1234567"], type: "Mobile" } } as unknown as Request;
        const res = createMockRes();
        let forwarded: unknown = null;

        await phonesController.createPhone(req, res as unknown as Response, (err?: unknown) => {
            forwarded = err;
        });

        assert.equal(forwarded, null, "must not be forwarded to the 500 error handler");
        assert.equal(res.statusCode, 409);
        assert.equal(bodyOf(res).code, "DUPLICATE_PHONE_NUMBER");
        assert.equal(bodyOf(res).message, 'The number 050-1234567 already exists in contact "Front Desk"');
    });

    it("updatePhone responds 409 DUPLICATE_PHONE_NUMBER and does not write", async () => {
        patch(Phone, "findOne", async () => ({ name: "Front Desk", numbers: ["03-5550000"] }));
        let wrote = false;
        patch(Phone, "findByIdAndUpdate", async () => {
            wrote = true;
            return {};
        });
        const req = { params: { id: newId() }, body: { numbers: ["03-5550000"] } } as unknown as Request;
        const res = createMockRes();

        await phonesController.updatePhone(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 409);
        assert.equal(bodyOf(res).code, "DUPLICATE_PHONE_NUMBER");
        assert.equal(wrote, false);
    });
});

// --- Route validation -------------------------------------------------------

describe("route validation matches the database requirements", () => {
    it("createPhoneSchema requires a phone type and reports it as a field error", async () => {
        const { res, passed } = await runValidation({ body: createPhoneSchema }, { body: { name: "A", numbers: ["1"] } });
        assert.equal(passed, false);
        assert.equal(res.statusCode, 400);
        const errors = bodyOf(res).errors as Array<{ field: string }>;
        assert.deepEqual(errors.map((e) => e.field), ["type"]);
    });

    it("createPhoneSchema rejects a type outside the model enum and accepts a valid one", async () => {
        const invalid = await runValidation({ body: createPhoneSchema }, { body: { name: "A", numbers: ["1"], type: "Satellite" } });
        assert.equal(invalid.passed, false);

        const valid = await runValidation({ body: createPhoneSchema }, { body: { name: "A", numbers: ["1"], type: "Landline" } });
        assert.equal(valid.passed, true);
    });

    it("createReportSchema requires title, startTime and endTime", async () => {
        const { res, passed } = await runValidation({ body: createReportSchema }, { body: { groupId: newId() } });
        assert.equal(passed, false);
        const fields = (bodyOf(res).errors as Array<{ field: string }>).map((e) => e.field).sort();
        assert.deepEqual(fields, ["endTime", "startTime", "title"]);
    });

    it("createReportSchema accepts the ISO date-time payload the client sends", async () => {
        const start = new Date("2026-10-13T07:00:00.000Z");
        const { passed } = await runValidation(
            { body: createReportSchema },
            { body: { groupId: newId(), title: "Morning - 13/10/2026", startTime: start.toISOString(), endTime: new Date(start.getTime() + 8 * 3600_000).toISOString() } },
        );
        assert.equal(passed, true);
    });

    it("errorHandler returns field-level errors[] for Mongoose ValidationErrors", () => {
        const validationError = new Phone({ name: "No Type", numbers: ["1"] }).validateSync();
        assert.ok(validationError, "Phone without a type must fail model validation");
        const res = createMockRes();

        errorHandler(validationError, { method: "POST", originalUrl: "/api/phones" } as Request, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 400);
        assert.equal(bodyOf(res).code, "VALIDATION_ERROR");
        const errors = bodyOf(res).errors as Array<{ field: string; message: string }>;
        assert.ok(errors.some((e) => e.field === "type"), "errors[] must name the failing field");
    });

    it("errorHandler reports the full path for errors inside array subdocuments", () => {
        const validationError = new ShiftSchedule({
            groupId: newId(),
            startDate: new Date("2026-10-11"),
            endDate: new Date("2026-10-17"),
            shifts: [{ userId: newId(), shiftTypeId: newId(), date: new Date("2026-10-12"), vacationValue: 0.75 }],
        }).validateSync();
        assert.ok(validationError);
        const res = createMockRes();

        errorHandler(validationError, { method: "PUT", originalUrl: "/api/schedules" } as Request, res as unknown as Response, () => {});

        const fields = (bodyOf(res).errors as Array<{ field: string }>).map((e) => e.field);
        assert.ok(fields.includes("shifts.0.vacationValue"), `expected a dotted path, got ${fields.join(", ")}`);
    });

    it("PUT /users/:id reports Mongoose validation errors in the same { field, message } shape", async () => {
        const validationError = new User({ username: "dana", email: "not-an-email" }).validateSync();
        assert.ok(validationError);
        patch(User, "findById", async () => ({ _id: newId(), username: "dana", groups: [] }));
        patch(User, "findByIdAndUpdate", async () => {
            throw validationError;
        });
        patch(console, "error", () => {});
        const req = {
            params: { id: newId() },
            body: { email: "not-an-email" },
            user: { username: config.superAdmin.username, groups: [] },
        } as unknown as Request;
        const res = createMockRes();

        await usersController.updateUser(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 400);
        assert.equal(bodyOf(res).code, "VALIDATION_ERROR");
        const errors = bodyOf(res).errors as Array<{ field: string; message: string }>;
        assert.deepEqual(errors.map((e) => e.field), ["email"]);
        assert.equal(typeof errors[0].message, "string");
    });
});

// --- Schedule save validation -----------------------------------------------

describe("schedule save validates dates and shift contents", () => {
    const validPayload = () => ({
        groupId: newId(),
        startDate: "2026-10-11T00:00:00.000Z",
        endDate: "2026-10-17T23:59:59.999Z",
        shifts: [{ userId: newId(), shiftTypeId: newId(), date: "2026-10-12T00:00:00.000Z", vacationValue: 0.5 }],
    });

    it("accepts the payload the schedule page sends", () => {
        assert.equal(saveScheduleSchema.safeParse(validPayload()).success, true);
    });

    const rejections: Array<[string, (p: ReturnType<typeof validPayload>) => unknown]> = [
        ["missing startDate", (p) => ({ ...p, startDate: undefined })],
        ["malformed endDate", (p) => ({ ...p, endDate: "next friday" })],
        ["endDate before startDate", (p) => ({ ...p, endDate: "2026-10-01T00:00:00.000Z" })],
        ["missing shifts array", (p) => ({ ...p, shifts: undefined })],
        ["vacationValue outside the 0.5/1.0 enum", (p) => ({ ...p, shifts: [{ ...p.shifts[0], vacationValue: 0.75 }] })],
        ["non-ObjectId userId", (p) => ({ ...p, shifts: [{ ...p.shifts[0], userId: "alice" }] })],
        ["malformed shift date", (p) => ({ ...p, shifts: [{ ...p.shifts[0], date: "32/13/2026" }] })],
    ];
    for (const [label, mutate] of rejections) {
        it(`rejects ${label}`, () => {
            assert.equal(saveScheduleSchema.safeParse(mutate(validPayload())).success, false);
        });
    }

    it("strips the server-managed vacationDeducted flag from client shifts", () => {
        const payload = validPayload();
        const parsed = saveScheduleSchema.parse({ ...payload, shifts: [{ ...payload.shifts[0], vacationDeducted: true }] });
        assert.equal("vacationDeducted" in parsed.shifts[0], false);
    });

    it("saveSchedule upserts with runValidators enabled", async () => {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `sched-${groupId}`, settings: { shiftTypes: [] } });
        // A week with no schedule yet, planned for active members of the group
        patch(ShiftSchedule, "findOne", async () => null);
        patch(User, "find", async (filter: { _id: { $in: string[] } }) => filter._id.$in.map((_id) => ({ _id })));
        let capturedOptions: Record<string, unknown> | null = null;
        patch(ShiftSchedule, "findOneAndUpdate", async (filter: Record<string, unknown>, _update: unknown, options: Record<string, unknown>) => {
            // Not published yet: the draft-of-published write matches nothing, then the draft is upserted
            if (filter.isPublished === true) return null;
            capturedOptions = options;
            return { _id: newId() };
        });
        const req = {
            body: { ...validPayload(), groupId },
            user: { _id: newId(), groups: [{ groupId, role: "shift_manager" }] },
        } as unknown as Request;
        const res = createMockRes();

        await schedulesController.saveSchedule(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 200);
        assert.ok(capturedOptions, "findOneAndUpdate must be called");
        assert.equal((capturedOptions as Record<string, unknown>).runValidators, true);
        assert.equal((capturedOptions as Record<string, unknown>).upsert, true);
    });
});

// --- Publishing and vacation balances ---------------------------------------

describe("publishing with too little vacation balance fails loudly and atomically", () => {
    interface FakeUser { _id: string; username: string; vacationBalance: number; groupIds: string[]; isActive?: boolean }

    interface PublishSetup {
        users: FakeUser[];
        /** Owners of one vacation day each in the pending version (the draft). */
        draftOwners: string[];
        /** Owners of one charged vacation day each in the published version; omitted for a first publish. */
        publishedOwners?: string[];
    }

    /**
     * Publishes against a tiny in-memory user store whose mocks honour the `isActive`,
     * `groups.groupId` and `vacationBalance` filters the controller sends.
     */
    async function publish({ users, draftOwners, publishedOwners }: PublishSetup) {
        const groupId = users[0].groupIds[0];
        const vacationTypeId = newId();
        mockGroupLookup({ _id: groupId, name: `pub-${groupId}`, settings: { shiftTypes: [{ _id: vacationTypeId, isVacation: true }] } });

        const state = {
            committed: null as Record<string, unknown> | null,
            aborted: false,
            charged: [] as string[],
            refunds: [] as Array<{ id: string; inc: unknown }>,
            reportsTouched: 0,
            error: null as unknown,
        };
        // Stand-in for the MongoDB transaction: runs the work and records whether it was aborted
        patch(ShiftSchedule.db, "transaction", async (work: (session: unknown) => Promise<unknown>) => {
            try {
                return await work({});
            } catch (err) {
                state.aborted = true;
                throw err;
            }
        });
        const scheduleId = newId();
        const vacationDay = (userId: string, deducted: boolean) => ({
            userId, shiftTypeId: vacationTypeId, date: new Date("2026-10-12"), vacationValue: 1, vacationDeducted: deducted,
        });
        const draft = draftOwners.map((userId) => vacationDay(userId, false));
        patch(ShiftSchedule, "findById", async () => (publishedOwners
            ? { _id: scheduleId, groupId, isPublished: true, revision: 1, shifts: publishedOwners.map((u) => vacationDay(u, true)), draftShifts: draft }
            // A first publish of a draft: unpublished schedules keep their draft in `shifts`
            : { _id: scheduleId, groupId, isPublished: false, revision: 1, shifts: draft }));
        patch(ShiftSchedule, "findOneAndUpdate", async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
            state.committed = update.$set;
            return { _id: scheduleId, groupId, ...update.$set };
        });
        const matches = (user: FakeUser, filter: Record<string, unknown>) =>
            (filter["groups.groupId"] === undefined || user.groupIds.includes(String(filter["groups.groupId"]))) &&
            (filter.isActive === undefined || user.isActive !== false);
        patch(User, "findOneAndUpdate", async (filter: Record<string, unknown> & { vacationBalance: { $gte: number } }) => {
            const user = users.find((u) => u._id === String(filter._id));
            if (!user || !matches(user, filter) || user.vacationBalance < filter.vacationBalance.$gte) return null;
            state.charged.push(user._id);
            return { _id: user._id };
        });
        patch(User, "findByIdAndUpdate", async (id: unknown, update: { $inc?: unknown }) => {
            state.refunds.push({ id: String(id), inc: update.$inc });
            return {};
        });
        patch(User, "find", async (filter: Record<string, unknown> & { _id: { $in: string[] } }) =>
            users.filter((u) => filter._id.$in.includes(u._id) && matches(u, filter)));
        patch(ShiftReport, "find", async () => []);
        patch(ShiftReport, "updateOne", async () => {
            state.reportsTouched++;
            return {};
        });

        const req = {
            body: { scheduleId: newId() },
            user: { _id: newId(), groups: [{ groupId, role: "shift_manager" }] },
        } as unknown as Request;
        const res = createMockRes();
        await schedulesController.publishSchedule(req, res as unknown as Response, (err?: unknown) => {
            state.error = err;
        });
        assert.equal(state.error, null, "the publish must not fail with an unexpected error");
        return { res, state };
    }
    const publishedOwnersOf = (state: { committed: Record<string, unknown> | null }) =>
        ((state.committed?.shifts ?? []) as Array<{ userId: string; vacationDeducted: boolean }>).map((s) => [s.userId, s.vacationDeducted]);

    it("answers 400 INSUFFICIENT_VACATION_BALANCE and aborts the transaction, so nothing is charged or published", async () => {
        const groupId = newId();
        const alice: FakeUser = { _id: newId(), username: "alice", vacationBalance: 5, groupIds: [groupId] };
        const bob: FakeUser = { _id: newId(), username: "bob", vacationBalance: 0, groupIds: [groupId] };

        const { res, state } = await publish({ users: [alice, bob], draftOwners: [alice._id, bob._id] });

        assert.equal(res.statusCode, 400);
        assert.equal(bodyOf(res).code, "INSUFFICIENT_VACATION_BALANCE");
        assert.deepEqual(bodyOf(res).insufficientBalances, [
            { userId: bob._id, requiredBalance: 1, reason: "INSUFFICIENT_BALANCE", username: "bob", availableBalance: 0 },
        ]);
        assert.match(String(bodyOf(res).message), /bob \(needs 1, has 0\)/);
        assert.equal(state.committed, null, "the schedule must not be published");
        assert.equal(state.aborted, true, "the transaction must be aborted, which undoes Alice's charge");
        assert.equal(state.reportsTouched, 0, "a failed publish changes no report");
    });

    it("blocks on the group's Shift Manager like on any other active member", async () => {
        const groupId = newId();
        const manager: FakeUser = { _id: newId(), username: "manager", vacationBalance: 0, groupIds: [groupId] };

        const { res, state } = await publish({ users: [manager], draftOwners: [manager._id] });

        assert.equal(res.statusCode, 400);
        assert.equal(state.committed, null);
    });

    it("leaves out a user outside the group: never charged, never described, never blocking", async () => {
        const groupId = newId();
        const member: FakeUser = { _id: newId(), username: "member", vacationBalance: 5, groupIds: [groupId] };
        const outsider: FakeUser = { _id: newId(), username: "outsider", vacationBalance: 0, groupIds: [newId()] };

        const { res, state } = await publish({ users: [member, outsider], draftOwners: [member._id, outsider._id] });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(state.charged, [member._id], "the outsider's balance must not be touched");
        assert.deepEqual(state.refunds, []);
        assert.deepEqual(publishedOwnersOf(state), [[member._id, true]], "the outsider's unpublished day is dropped");
        assert.equal("vacationWarnings" in bodyOf(res), false);
    });

    it("never lets a deactivated member block a publish, and drops their unpublished days", async () => {
        const groupId = newId();
        const active: FakeUser = { _id: newId(), username: "active", vacationBalance: 5, groupIds: [groupId] };
        const former: FakeUser = { _id: newId(), username: "former", vacationBalance: 0, groupIds: [groupId], isActive: false };

        const { res, state } = await publish({ users: [active, former], draftOwners: [active._id, former._id] });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(state.charged, [active._id], "nobody charges the deactivated member");
        assert.deepEqual(publishedOwnersOf(state), [[active._id, true]]);
        assert.equal("vacationWarnings" in bodyOf(res), false);
    });

    it("keeps a silent member's published, charged days exactly as they were, even when the draft drops them", async () => {
        const groupId = newId();
        const active: FakeUser = { _id: newId(), username: "active", vacationBalance: 5, groupIds: [groupId] };
        const former: FakeUser = { _id: newId(), username: "former", vacationBalance: 0, groupIds: [groupId], isActive: false };

        // Published: both charged. Draft: only the active member (the grid never shows the former one)
        const { res, state } = await publish({
            users: [active, former],
            draftOwners: [active._id],
            publishedOwners: [active._id, former._id],
        });

        // The draft equals what is published once the former member's day is put back: a no-op publish
        assert.equal(res.statusCode, 200);
        assert.equal(bodyOf(res).unchanged, true);
        assert.deepEqual(state.refunds, [], "the deactivated member is not refunded");
        assert.deepEqual(state.charged, [], "the active member's carried day is not charged again");
    });

    it("lists only the blocking active members when shortfalls are mixed with silent ones", async () => {
        const groupId = newId();
        const bob: FakeUser = { _id: newId(), username: "bob", vacationBalance: 0, groupIds: [groupId] };
        const outsider: FakeUser = { _id: newId(), username: "outsider", vacationBalance: 0, groupIds: [newId()] };

        const { res, state } = await publish({ users: [bob, outsider], draftOwners: [bob._id, outsider._id] });

        assert.equal(res.statusCode, 400);
        assert.equal(state.committed, null);
        assert.deepEqual(state.charged, []);
        assert.deepEqual(bodyOf(res).insufficientBalances, [
            { userId: bob._id, requiredBalance: 1, reason: "INSUFFICIENT_BALANCE", username: "bob", availableBalance: 0 },
        ]);
    });

    it("publishes normally when every vacation day is charged", async () => {
        const groupId = newId();
        const alice: FakeUser = { _id: newId(), username: "alice", vacationBalance: 5, groupIds: [groupId] };

        const { res, state } = await publish({ users: [alice], draftOwners: [alice._id] });

        assert.equal(res.statusCode, 200);
        assert.equal(bodyOf(res).isPublished, true);
        assert.deepEqual(publishedOwnersOf(state), [[alice._id, true]]);
    });
});

// --- Phone favorites --------------------------------------------------------

describe("favoriting a phone requires the contact to exist", () => {
    it("answers 404 and leaves favorites untouched when the contact does not exist", async () => {
        patch(User, "findOneAndUpdate", async () => null); // not currently a favorite
        patch(Phone, "exists", async () => null);
        let added = false;
        patch(User, "findByIdAndUpdate", async () => {
            added = true;
            return { favoritePhones: [] };
        });
        const req = { user: { _id: newId() }, params: { id: newId() } } as unknown as Request;
        const res = createMockRes();

        await phonesController.toggleFavorite(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { message: "Phone contact not found", code: "NOT_FOUND" });
        assert.equal(added, false, "no phantom favorite may be stored");
    });

    it("still removes an existing favorite even if the contact was since deleted", async () => {
        patch(User, "findOneAndUpdate", async () => ({ favoritePhones: [] }));
        let existenceChecked = false;
        patch(Phone, "exists", async () => {
            existenceChecked = true;
            return null;
        });
        const req = { user: { _id: newId() }, params: { id: newId() } } as unknown as Request;
        const res = createMockRes();

        await phonesController.toggleFavorite(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { favoritePhones: [] });
        assert.equal(existenceChecked, false);
    });

    it("adds the favorite when the contact exists", async () => {
        const phoneId = newId();
        patch(User, "findOneAndUpdate", async () => null);
        patch(Phone, "exists", async () => ({ _id: phoneId }));
        patch(User, "findByIdAndUpdate", async () => ({ favoritePhones: [phoneId] }));
        const req = { user: { _id: newId() }, params: { id: phoneId } } as unknown as Request;
        const res = createMockRes();

        await phonesController.toggleFavorite(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { favoritePhones: [phoneId] });
    });
});

// --- User responses ---------------------------------------------------------

describe("user responses never expose ssoIssuer, ssoSubject or tokenVersion", () => {
    const sensitive = { ssoIssuer: "https://idp.example.com/", ssoSubject: "auth0|abc123", tokenVersion: 4 };

    it("toPublicUser strips the internal fields from plain objects without mutating them", () => {
        const user = { _id: newId(), username: "dana", ...sensitive };
        const result = toPublicUser(user);
        assert.equal(result.username, "dana");
        for (const field of Object.keys(sensitive)) {
            assert.equal(field in result, false, `${field} must be removed`);
        }
        assert.equal(user.tokenVersion, 4, "input must not be mutated");
    });

    it("hydrated User documents drop the internal fields when serialized", () => {
        const doc = new User({ username: "dana", email: "dana@example.com", ...sensitive });
        const json = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
        assert.equal(json.username, "dana");
        assert.equal("ssoSubject" in json, false);
        assert.equal("ssoIssuer" in json, false);
        assert.equal("tokenVersion" in json, false);
        assert.equal(doc.tokenVersion, 4, "the document itself keeps tokenVersion for server use");
    });

    it("GET /users (group-scoped) omits the internal fields", async () => {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `users-${groupId}` });
        patch(User, "find", async () => [{ _id: newId(), username: "dana", groups: [{ groupId, role: "member" }], ...sensitive }]);
        const req = { query: { groupId }, user: { _id: newId(), groups: [{ groupId, role: "member" }] } } as unknown as Request;
        const res = createMockRes();

        await usersController.getUsers(req, res as unknown as Response, () => {});

        const [entry] = res.body as Array<Record<string, unknown>>;
        assert.equal(entry.username, "dana");
        assert.equal("ssoSubject" in entry, false);
        assert.equal("tokenVersion" in entry, false);
    });

    it("PATCH /users/:id/manager-update response omits the internal fields", async () => {
        const groupId = newId();
        const target = {
            _id: newId(),
            username: "dana",
            groups: [{ groupId, role: "member" }],
            vacationBalance: 3,
            ...sensitive,
            save: async function (this: unknown) {
                return this;
            },
        };
        patch(User, "findById", async () => target);
        const req = {
            params: { id: target._id },
            body: { vacationBalance: 5 },
            user: { _id: newId(), username: "mgr", groups: [{ groupId, role: "shift_manager" }] },
        } as unknown as Request;
        const res = createMockRes();

        await usersController.managerUpdate(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 200);
        assert.equal(bodyOf(res).vacationBalance, 5);
        assert.equal("tokenVersion" in bodyOf(res), false);
        assert.equal("ssoSubject" in bodyOf(res), false);
    });

    it("GET /auth/me omits the internal fields", async () => {
        const req = { user: { _id: newId(), username: "dana", groups: [], ...sensitive } } as unknown as Request;
        const res = createMockRes();

        await authController.getMe(req, res as unknown as Response, () => {});

        assert.equal(bodyOf(res).username, "dana");
        assert.equal("tokenVersion" in bodyOf(res), false);
        assert.equal("ssoIssuer" in bodyOf(res), false);
    });

    it("GET /auth/me never includes the vacation balance (only Shift Managers see balances)", async () => {
        const req = { user: { _id: newId(), username: "dana", groups: [], vacationBalance: 7 } } as unknown as Request;
        const res = createMockRes();

        await authController.getMe(req, res as unknown as Response, () => {});

        assert.equal(bodyOf(res).username, "dana");
        assert.equal("vacationBalance" in bodyOf(res), false);
        assert.equal((req.user as unknown as Record<string, unknown>).vacationBalance, 7, "the session's user object is not modified");
    });

    it("GET /auth/me drops a membership whose group no longer exists (it populates as null)", async () => {
        const groupId = newId();
        const req = {
            user: {
                _id: newId(),
                username: "dana",
                groups: [
                    { groupId: null, role: "shift_manager", order: 0 },
                    { groupId: { _id: groupId, name: "noc" }, role: "member", order: 1 },
                ],
            },
        } as unknown as Request;
        const res = createMockRes();

        await authController.getMe(req, res as unknown as Response, () => {});

        assert.deepEqual(bodyOf(res).groups, [
            { groupId: { _id: groupId, name: "noc" }, role: "member", order: 1, isSystemGroup: false },
        ]);
    });
});

// --- Schedule lookup --------------------------------------------------------

describe("GET /schedules answers 404 when nothing covers the date and matches by range", () => {
    function setup(scheduleResult: Record<string, unknown> | null) {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `get-${groupId}` });
        const captured: { filter?: Record<string, unknown>; sort?: unknown } = {};
        patch(ShiftSchedule, "findOne", (filter: Record<string, unknown>) => {
            captured.filter = filter;
            return {
                sort: (sortSpec: unknown) => {
                    captured.sort = sortSpec;
                    return { lean: async () => scheduleResult };
                },
            };
        });
        const req = {
            query: { groupId, date: "2026-10-14T00:00:00.000Z" },
            user: { _id: newId(), groups: [{ groupId, role: "member" }] },
        } as unknown as Request;
        return { req, captured };
    }

    it("answers 404 NOT_FOUND instead of 200 null", async () => {
        const { req } = setup(null);
        const res = createMockRes();

        await schedulesController.getSchedule(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 404);
        assert.equal(bodyOf(res).code, "NOT_FOUND");
    });

    it("looks up the schedule whose range covers a mid-week date, preferring the latest start", async () => {
        const schedule = { _id: newId(), isPublished: true, shifts: [] };
        const { req, captured } = setup(schedule);
        const res = createMockRes();

        await schedulesController.getSchedule(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, schedule);
        const target = new Date("2026-10-14T00:00:00.000Z");
        assert.deepEqual(captured.filter?.startDate, { $lte: target });
        assert.deepEqual(captured.filter?.endDate, { $gte: target });
        assert.equal(captured.filter?.isPublished, true, "members only see published schedules");
        assert.deepEqual(captured.sort, { startDate: -1 });
    });
});

// --- Tag deletion and partial updates ---------------------------------------

describe("tag deletion of an unknown tag is a 404; partial updates have PATCH routes", () => {
    it("deleteTag answers 404 NOT_FOUND for a tag the group does not have, changing nothing", async () => {
        const groupId = newId();
        let saved = false;
        mockGroupLookup({ _id: groupId, name: `tags-${groupId}`, siteTags: ["General", "Alpha"], save: async () => { saved = true; } });
        let sitesMoved = false;
        patch(Site, "updateMany", async () => {
            sitesMoved = true;
        });
        const req = { params: { id: groupId }, query: { tagName: "Ghost" } } as unknown as Request;
        const res = createMockRes();

        await groupsController.deleteTag(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 404);
        assert.deepEqual(res.body, { message: "Tag not found", code: "NOT_FOUND" });
        assert.equal(saved, false);
        assert.equal(sitesMoved, false);
    });

    function methodsFor(router: Router, routePath: string): string[] {
        const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
        return stack
            .filter((layer) => layer.route?.path === routePath)
            .flatMap((layer) => Object.keys(layer.route?.methods ?? {}));
    }

    for (const [name, router] of [["sites", sitesRouter], ["phones", phonesRouter], ["reports", reportsRouter], ["groups", groupsRouter]] as const) {
        it(`${name} router serves partial updates on PATCH /:id only`, () => {
            const methods = methodsFor(router, "/:id");
            assert.ok(methods.includes("patch"), "PATCH /:id must exist");
            assert.ok(!methods.includes("put"), "PUT /:id must not exist: updates are partial, so PATCH is the only verb");
        });
    }
});

// --- Tag names --------------------------------------------------------------

describe("tag names travel in the body or the query string, never in the path", () => {
    const tag = "Tier 1 / Alpha";

    function tagApp(): { app: express.Express; state: { saved: string[][]; moved: Array<Record<string, unknown>> } } {
        const groupId = newId();
        const state = { saved: [] as string[][], moved: [] as Array<Record<string, unknown>> };
        const group: Record<string, unknown> = { _id: groupId, name: `tags-${groupId}`, siteTags: ["General", tag] };
        group.save = async () => {
            state.saved.push([...(group.siteTags as string[])]);
        };
        mockGroupLookup(group);
        patch(Site, "updateMany", async (_filter: unknown, update: Record<string, unknown>) => {
            state.moved.push(update);
        });
        const app = express();
        app.use(express.json());
        app.put("/api/groups/:id/tags", validateRequest({ params: groupIdParamSchema, body: renameTagSchema }), groupsController.renameTag);
        app.delete("/api/groups/:id/tags", validateRequest({ params: groupIdParamSchema, query: deleteTagQuerySchema }), groupsController.deleteTag);
        app.locals.groupId = groupId;
        return { app, state };
    }

    it("renames a tag containing spaces and '/' given in the body", async () => {
        const { app, state } = tagApp();

        await withServer(app, async (baseUrl) => {
            const response = await fetch(`${baseUrl}/api/groups/${app.locals.groupId}/tags`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tagName: tag, newTagName: "Tier 2 / Bravo" }),
            });
            assert.equal(response.status, 200);
            assert.deepEqual(((await response.json()) as { siteTags: string[] }).siteTags, ["General", "Tier 2 / Bravo"]);
        });
        assert.deepEqual(state.moved, [{ $set: { tag: "Tier 2 / Bravo" } }]);
    });

    it("deletes a tag containing spaces and '/' given in the query string", async () => {
        const { app, state } = tagApp();

        await withServer(app, async (baseUrl) => {
            const response = await fetch(`${baseUrl}/api/groups/${app.locals.groupId}/tags?tagName=${encodeURIComponent(tag)}`, { method: "DELETE" });
            assert.equal(response.status, 200);
            assert.deepEqual(((await response.json()) as { siteTags: string[] }).siteTags, ["General"]);
        });
        assert.deepEqual(state.saved, [["General"]]);
    });

    it("rejects a rename or delete without a tag name", async () => {
        const { app } = tagApp();

        await withServer(app, async (baseUrl) => {
            const rename = await fetch(`${baseUrl}/api/groups/${app.locals.groupId}/tags`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newTagName: "Bravo" }),
            });
            assert.equal(rename.status, 400);
            const remove = await fetch(`${baseUrl}/api/groups/${app.locals.groupId}/tags`, { method: "DELETE" });
            assert.equal(remove.status, 400);
        });
    });

    it("no longer serves the path-segment routes", () => {
        const stack = (groupsRouter as unknown as { stack: Array<{ route?: { path: string } }> }).stack;
        assert.equal(stack.some((layer) => layer.route?.path === "/:id/tags/:tagName"), false);
    });
});

// --- Logout -----------------------------------------------------------------

describe("logout revokes the session behind the session cookie", () => {
    /**
     * @param storedVersions - Each user's stored tokenVersion.
     * @returns The ids whose tokenVersion was incremented, honouring the controller's version filter.
     */
    function setup(storedVersions: Record<string, number>) {
        // Keep logout offline: OIDC discovery fails fast and logoutUrl is simply omitted
        authController.resetClientCache();
        patch(Issuer, "discover", async () => {
            throw new Error("offline in tests");
        });
        // The controller logs the (expected) discovery failure; keep test output readable
        patch(console, "error", () => {});
        patch(console, "warn", () => {});
        restores.push(() => authController.resetClientCache());
        const revoked: string[] = [];
        patch(User, "updateOne", async (filter: Record<string, unknown>, update: { $inc?: { tokenVersion?: number } }) => {
            const id = String(filter._id);
            if (!(id in storedVersions) || update.$inc?.tokenVersion !== 1) return { matchedCount: 0 };
            const current = storedVersions[id];
            const versionMatches = !("tokenVersion" in filter) || filter.tokenVersion === current;
            if (!versionMatches) return { matchedCount: 0 };
            storedVersions[id] = current + 1;
            revoked.push(id);
            return { matchedCount: 1 };
        });
        return revoked;
    }

    async function logoutWith(cookies: Record<string, string>, headers: Record<string, string> = {}): Promise<MockRes> {
        const res = createMockRes();
        await authController.logout({ headers, cookies } as unknown as Request, res as unknown as Response, () => {});
        return res;
    }

    it("increments tokenVersion for the user behind the session cookie", async () => {
        const userId = newId();
        const revoked = setup({ [userId]: 0 });
        const token = generateToken({ _id: userId, username: "cookie-user", tokenVersion: 0 });

        const res = await logoutWith({ [ssoConfig.sessionCookieName]: token });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(revoked, [userId]);
    });

    it("still revokes an expired but correctly signed session token", async () => {
        const userId = newId();
        const revoked = setup({ [userId]: 2 });
        const expired = jwt.sign({ userId, username: "late", tokenVersion: 2 }, config.jwt.secret, { expiresIn: -60 });

        await logoutWith({ [ssoConfig.sessionCookieName]: expired });

        assert.deepEqual(revoked, [userId]);
    });

    it("cannot replay an already-revoked token to keep logging its owner out", async () => {
        const userId = newId();
        const revoked = setup({ [userId]: 2 });
        const stale = generateToken({ _id: userId, username: "owner", tokenVersion: 1 });

        await logoutWith({ [ssoConfig.sessionCookieName]: stale });

        assert.deepEqual(revoked, [], "a token older than the current version must not bump it again");
    });

    it("ignores forged tokens so nobody can revoke another user's sessions", async () => {
        const victimId = newId();
        const revoked = setup({ [victimId]: 0 });
        const forged = jwt.sign({ userId: victimId, username: "victim", tokenVersion: 0 }, "not-the-server-secret");

        const res = await logoutWith({ [ssoConfig.sessionCookieName]: forged });

        assert.equal(res.statusCode, 200, "logout itself still succeeds");
        assert.deepEqual(revoked, []);
    });

    it("revokes nothing for an Authorization: Bearer token: sessions are cookie-only", async () => {
        const userId = newId();
        const revoked = setup({ [userId]: 0 });
        const token = generateToken({ _id: userId, username: "bearer-user", tokenVersion: 0 });

        const res = await logoutWith({}, { authorization: `Bearer ${token}` });

        assert.equal(res.statusCode, 200);
        assert.deepEqual(revoked, []);
    });
});

// --- Report deletion --------------------------------------------------------

describe("report deletion is reserved to the group's Shift Manager", () => {
    it("rejects an Administrator who is only a member of the report's group", async () => {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `rep-${groupId}` });
        patch(ShiftReport, "findById", async () => ({ _id: newId(), groupId }));
        let deleted = false;
        patch(ShiftReport, "findByIdAndDelete", async () => {
            deleted = true;
        });
        const admin = { _id: newId(), username: config.superAdmin.username, groups: [{ groupId, role: "member" }] };
        const req = { params: { id: newId() }, user: admin } as unknown as Request;
        const res = createMockRes();

        await reportsController.deleteReport(req, res as unknown as Response, () => {});

        assert.equal(res.statusCode, 403);
        assert.equal(bodyOf(res).code, "FORBIDDEN_SHIFT_MANAGER_REQUIRED");
        assert.equal(deleted, false);
    });

    it("counts the group's Shift Manager as a group member: they can create, read and update reports", async () => {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `rep-${groupId}`, settings: { timeSlots: [] } });
        const manager = { _id: newId(), username: "manager", groups: [{ groupId, role: "shift_manager" }] };

        // Create
        patch(ShiftReport, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
        patch(ShiftSchedule, "findOne", () => ({ select: () => ({ lean: async () => null }) }));
        patch(ShiftReport.prototype, "save", async function (this: unknown) {
            return this;
        });
        const created = createMockRes();
        await reportsController.createReport(
            { body: { groupId, title: "Morning", startTime: "2026-10-14T05:00:00.000Z", endTime: "2026-10-14T13:00:00.000Z" }, user: manager } as unknown as Request,
            created as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );
        assert.equal(created.statusCode, 201);

        // Read
        patch(ShiftReport, "find", () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
        const listed = createMockRes() as MockRes & { setHeader: () => void };
        listed.setHeader = () => {};
        await reportsController.getReports(
            { query: { groupId }, user: manager } as unknown as Request,
            listed as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );
        assert.equal(listed.statusCode, 200);

        // Update
        patch(ShiftReport, "findById", async () => ({ _id: newId(), groupId }));
        patch(ShiftReport, "findByIdAndUpdate", async () => ({ _id: newId(), groupId, currentTasks: "done" }));
        const updated = createMockRes();
        await reportsController.updateReport(
            { params: { id: newId() }, body: { currentTasks: "done" }, user: manager } as unknown as Request,
            updated as unknown as Response,
            (err?: unknown) => assert.fail(String(err)),
        );
        assert.equal(updated.statusCode, 200);
    });
});

// --- Error codes ------------------------------------------------------------

describe("every error response carries a machine-readable code", () => {
    it("no controller or middleware sends a 4xx/5xx JSON object literal without `code`", () => {
        const dirs = [path.join(__dirname, "..", "controllers"), path.join(__dirname, "..", "middleware")];
        const offenders: string[] = [];
        for (const dir of dirs) {
            for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
                const src = fs.readFileSync(path.join(dir, file), "utf8");
                const callPattern = /res\.status\((\d{3})\)\.json\(/g;
                let match: RegExpExecArray | null;
                while ((match = callPattern.exec(src))) {
                    if (Number(match[1]) < 400) continue;
                    const argStart = match.index + match[0].length;
                    if (src[argStart] !== "{") continue; // shared response constants are checked where defined
                    let depth = 0;
                    let end = argStart;
                    for (; end < src.length; end++) {
                        if (src[end] === "{") depth++;
                        if (src[end] === "}" && --depth === 0) break;
                    }
                    if (!/\bcode\s*:/.test(src.slice(argStart, end + 1))) {
                        offenders.push(`${file}:${src.slice(0, match.index).split("\n").length}`);
                    }
                }
            }
        }
        assert.deepEqual(offenders, [], `error responses without a code: ${offenders.join(", ")}`);
    });
});

// --- Group guards -----------------------------------------------------------

describe("group guards answer 404 for a missing group and 403 for non-members", () => {
    async function runGuard(guard: ReturnType<typeof requireGroupMember>, user: Record<string, unknown>) {
        const res = createMockRes();
        let nextCalled = false;
        await guard({ user } as unknown as Request, res as unknown as Response, (() => {
            nextCalled = true;
        }) as NextFunction);
        return { res, nextCalled };
    }

    it("requireGroupMember: nonexistent group → 404 NOT_FOUND", async () => {
        mockGroupLookup(null);
        const { res, nextCalled } = await runGuard(requireGroupMember(() => "No Such Group"), { _id: newId(), groups: [] });
        assert.equal(res.statusCode, 404);
        assert.equal(bodyOf(res).code, "NOT_FOUND");
        assert.equal(nextCalled, false);
    });

    it("requireGroupMember: existing group, caller not a member → 403", async () => {
        const groupId = newId();
        mockGroupLookup({ _id: groupId, name: `guard-${groupId}` });
        const { res } = await runGuard(requireGroupMember(() => groupId), { _id: newId(), groups: [] });
        assert.equal(res.statusCode, 403);
        assert.equal(bodyOf(res).code, "FORBIDDEN_GROUP_MEMBER_REQUIRED");
    });

    it("requireShiftManager: nonexistent group → 404 NOT_FOUND", async () => {
        mockGroupLookup(null);
        const { res, nextCalled } = await runGuard(requireShiftManager(() => newId()), { _id: newId(), groups: [] });
        assert.equal(res.statusCode, 404);
        assert.equal(bodyOf(res).code, "NOT_FOUND");
        assert.equal(nextCalled, false);
    });
});

// --- Rate limiting ----------------------------------------------------------

describe("the global rate limiter answers 429 as JSON", () => {
    it("returns application/json { message, code: RATE_LIMIT_EXCEEDED }", async () => {
        const app = express();
        app.use(createGlobalRateLimiter({ windowMs: 60_000, max: 1 }));
        app.get("/api/ping", (_req, res) => {
            res.json({ ok: true });
        });

        await withServer(app, async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
            const limited = await fetch(`${baseUrl}/api/ping`);
            assert.equal(limited.status, 429);
            assert.match(limited.headers.get("content-type") ?? "", /application\/json/);
            assert.deepEqual(await limited.json(), {
                message: "Too many requests, please try again after 1 minute",
                code: "RATE_LIMIT_EXCEEDED",
            });
        });
    });

    it("keeps probes and auth routes exempt", async () => {
        const app = express();
        app.use(createGlobalRateLimiter({ windowMs: 60_000, max: 1 }));
        app.get("/healthz", (_req, res) => {
            res.json({ ok: true });
        });

        await withServer(app, async (baseUrl) => {
            for (let i = 0; i < 3; i++) {
                assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
            }
        });
    });

    // The budget is per signed-in user; callers without a valid session cookie share their IP's budget
    function limitedApp(max: number): express.Express {
        const app = express();
        // As in app.ts, cookies are parsed before the limiter runs
        app.use(cookieParser());
        app.use(createGlobalRateLimiter({ windowMs: 60_000, max }));
        app.get("/api/ping", (_req, res) => {
            res.json({ ok: true });
        });
        return app;
    }
    const session = (token: string) => ({ headers: { Cookie: `${ssoConfig.sessionCookieName}=${token}` } });
    const tokenFor = (userId: string) => generateToken({ _id: userId, username: `u-${userId}` });

    it("gives two signed-in users on the same IP separate budgets", async () => {
        const alice = tokenFor(newId());
        const bob = tokenFor(newId());

        await withServer(limitedApp(2), async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(alice))).status, 200);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(alice))).status, 200);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(alice))).status, 429);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(bob))).status, 200, "Alice's lockout must not affect Bob");
        });
    });

    it("makes unauthenticated callers share their IP's budget, separate from signed-in users", async () => {
        const alice = tokenFor(newId());

        await withServer(limitedApp(1), async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
            assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 429);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(alice))).status, 200);
        });
    });

    it("counts a forged or expired token against the IP, so it cannot open a fresh budget", async () => {
        const forged = jwt.sign({ userId: newId(), username: "mallory" }, "not-the-server-secret-but-long-enough-0000");
        const expired = jwt.sign({ userId: newId(), username: "late", exp: Math.floor(Date.now() / 1000) - 60 }, config.jwt.secret);

        await withServer(limitedApp(1), async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(forged))).status, 429);
            assert.equal((await fetch(`${baseUrl}/api/ping`, session(expired))).status, 429);
        });
    });

    it("sends the standard RateLimit headers, and Retry-After on a 429", async () => {
        await withServer(limitedApp(1), async (baseUrl) => {
            const ok = await fetch(`${baseUrl}/api/ping`);
            assert.equal(ok.headers.get("ratelimit-limit"), "1");
            const limited = await fetch(`${baseUrl}/api/ping`);
            assert.equal(limited.status, 429);
            assert.ok(Number(limited.headers.get("retry-after")) > 0, "a client can tell when to retry");
        });
    });
});
