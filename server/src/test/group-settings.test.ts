/**
 * @module GroupSettingsTests
 *
 * No time slot may link a vacation shift type (Group schema rule): a report's automatic attendees
 * are the members on a shift type linked to its time slot, so a linked vacation type would list
 * people who are off as on duty. The rule holds for every request that changes a group's
 * settings, whichever field the request changed.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import Group from "../models/Group";
import * as groupsController from "../controllers/groupsController";
import { errorHandler } from "../middleware/errorMiddleware";
import { clearGroupCache } from "../utils/authHelpers";

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

const MORNING = newId();
const VACATION = newId();

const shiftTypes = [
    { _id: MORNING, name: "Morning", color: "#476db5", isVacation: false },
    { _id: VACATION, name: "Vacation", color: "#E57373", isVacation: true },
];

const slot = (linkedShiftTypes: string[]) => ({ name: "Day", startTime: "08:00", endTime: "16:00", linkedShiftTypes });

/**
 * A real Group document behind resolveGroup. Saving runs the schema validation, which is where
 * the rule lives, and records whether the save went through (no database involved).
 */
function mockGroup(settings: { shiftTypes: unknown[]; timeSlots: unknown[] }): { id: string; saved: () => boolean } {
    const group = new Group({ _id: newId(), name: `settings-${newId()}`, settings });
    let saved = false;
    patch(group, "save", async function (this: typeof group) {
        await this.validate();
        saved = true;
        return this;
    });
    patch(Group, "findById", async (id: unknown) => (String(group._id) === String(id) ? group : null));
    return { id: String(group._id), saved: () => saved };
}

async function send(method: "PUT" | "PATCH", path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.put("/api/groups/:id/settings", groupsController.updateSettings);
    app.patch("/api/groups/:id", groupsController.updateGroup);
    app.use(errorHandler);

    const server: http.Server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const address = server.address();
        const port = address && typeof address === "object" ? address.port : 0;
        const res = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    } finally {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
}

describe("Time slots cannot link vacation shift types", () => {
    it("rejects linking a vacation shift type to a time slot, and saves nothing", async () => {
        const group = mockGroup({ shiftTypes, timeSlots: [] });

        const res = await send("PUT", `/api/groups/${group.id}/settings`, { shiftTypes, timeSlots: [slot([MORNING, VACATION])] });

        assert.equal(res.status, 400);
        assert.equal(res.body.code, "VALIDATION_ERROR");
        assert.deepEqual(res.body.errors, [
            { field: "settings.timeSlots.0.linkedShiftTypes", message: 'Time slot "Day" cannot be linked to the vacation shift type "Vacation"' },
        ]);
        assert.equal(group.saved(), false);
    });

    it("rejects marking a shift type as vacation while a time slot links it", async () => {
        const group = mockGroup({ shiftTypes, timeSlots: [slot([MORNING])] });
        const morningAsVacation = shiftTypes.map((type) => (type._id === MORNING ? { ...type, isVacation: true } : type));

        const res = await send("PUT", `/api/groups/${group.id}/settings`, { shiftTypes: morningAsVacation, timeSlots: [slot([MORNING])] });

        assert.equal(res.status, 400);
        assert.deepEqual(res.body.errors, [
            { field: "settings.timeSlots.0.linkedShiftTypes", message: 'Time slot "Day" cannot be linked to the vacation shift type "Morning"' },
        ]);
        assert.equal(group.saved(), false);
    });

    it("accepts working shift types on a slot while vacation types stay unlinked", async () => {
        const group = mockGroup({ shiftTypes, timeSlots: [] });

        const res = await send("PUT", `/api/groups/${group.id}/settings`, { shiftTypes, timeSlots: [slot([MORNING])] });

        assert.equal(res.status, 200);
        assert.equal(group.saved(), true);
    });

    it("applies the same rule when an administrator replaces the settings through PATCH /groups/:id", async () => {
        const group = mockGroup({ shiftTypes, timeSlots: [] });

        const res = await send("PATCH", `/api/groups/${group.id}`, { settings: { shiftTypes, timeSlots: [slot([VACATION])] } });

        assert.equal(res.status, 400);
        assert.equal(res.body.code, "VALIDATION_ERROR");
        assert.equal(group.saved(), false);
    });
});
