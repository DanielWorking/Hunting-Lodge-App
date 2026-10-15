import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { addDays, format, startOfWeek } from "date-fns";
import apiClient, { clearInFlightRequests, isRateLimitError, rateLimitMessage } from "../api/apiClient";
import ShiftSchedulePage from "../pages/ShiftSchedulePage";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import type { Group, User } from "../types";

/**
 * A fake network for the real Axios instance: answers after a tick, honours abort signals like
 * the browser does, and counts the requests that reached it.
 */
function installAdapter(answer: (config: InternalAxiosRequestConfig) => { status: number; data: unknown; headers?: Record<string, string> }) {
    const calls: InternalAxiosRequestConfig[] = [];
    const adapter: AxiosAdapter = (config) => {
        calls.push(config);
        return new Promise((resolve, reject) => {
            const signal = config.signal as AbortSignal | undefined;
            const abort = () => reject(new CanceledError(undefined, undefined, config));
            if (signal?.aborted) return abort();
            signal?.addEventListener?.("abort", abort);
            setTimeout(() => {
                const { status, data, headers } = answer(config);
                const response = { data, status, statusText: "", headers: headers ?? {}, config, request: {} };
                if (status >= 400) {
                    const error = Object.assign(new Error(`Request failed with status code ${status}`), {
                        isAxiosError: true,
                        name: "AxiosError",
                        config,
                        response,
                        toJSON: () => ({}),
                    });
                    reject(error);
                } else {
                    resolve(response);
                }
            }, 5);
        });
    };
    const original = apiClient.defaults.adapter;
    apiClient.defaults.adapter = adapter;
    return { calls, restore: () => (apiClient.defaults.adapter = original) };
}

describe("apiClient", () => {
    let restore: () => void = () => {};
    beforeEach(() => {
        clearInFlightRequests();
    });
    afterEach(() => {
        restore();
        vi.restoreAllMocks();
    });

    it("a caller with its own signal is not handed another caller's aborted request", async () => {
        const net = installAdapter(() => ({ status: 200, data: { ok: true } }));
        restore = net.restore;

        const first = new AbortController();
        const firstRequest = apiClient.get("/schedules", { params: { week: 1 }, signal: first.signal });
        first.abort();
        const second = apiClient.get("/schedules", { params: { week: 1 }, signal: new AbortController().signal });

        await expect(firstRequest).rejects.toBeInstanceOf(CanceledError);
        await expect(second).resolves.toMatchObject({ data: { ok: true } });
    });

    it("still shares concurrent GETs that carry no signal", async () => {
        const net = installAdapter(() => ({ status: 200, data: [] }));
        restore = net.restore;

        const [a, b] = await Promise.all([apiClient.get("/groups"), apiClient.get("/groups")]);

        expect(a).toBe(b);
        expect(net.calls).toHaveLength(1);
    });

    it("rejects a 429 with a RateLimitError carrying Retry-After, and never retries it", async () => {
        const net = installAdapter(() => ({
            status: 429,
            data: { message: "Too many requests, please try again after 15 minutes", code: "RATE_LIMIT_EXCEEDED" },
            headers: { "retry-after": "90" },
        }));
        restore = net.restore;

        const error = await apiClient.get("/sites").catch((e: unknown) => e);

        expect(isRateLimitError(error)).toBe(true);
        if (!isRateLimitError(error)) return;
        expect(error.retryAfterSeconds).toBe(90);
        expect(error.response?.status).toBe(429);
        expect(rateLimitMessage(error)).toBe("Too many requests. Please try again in 2 minutes.");
        expect(net.calls).toHaveLength(1);
    });

    it("logs a nonprod 5xx body's details to the console", async () => {
        const net = installAdapter(() => ({
            status: 500,
            data: { message: "Internal server error", code: "INTERNAL_ERROR", details: { name: "TypeError", message: "boom" } },
        }));
        restore = net.restore;
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        await apiClient.get("/sites").catch(() => {});

        expect(consoleError).toHaveBeenCalledWith("[API] Server error details:", { name: "TypeError", message: "boom" });
    });
});

describe("ShiftSchedulePage in StrictMode", () => {
    let restore: () => void = () => {};
    afterEach(() => {
        restore();
        vi.restoreAllMocks();
    });

    it("shows the published week when mounted with the group already selected", async () => {
        const morning = { _id: "type-morning", name: "Morning", color: "#1976d2", isVacation: false };
        const group: Group = { _id: "group-1", name: "Alpha", members: [], createdAt: "", settings: { shiftTypes: [morning], timeSlots: [] } };
        const dana: User = { _id: "user-dana", username: "dana", displayName: "Dana", isActive: true, groups: [{ groupId: "group-1", role: "member" }] };
        const monday = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 1);
        const net = installAdapter(() => ({
            status: 200,
            data: { _id: "s", isPublished: true, startDate: monday.toISOString(), shifts: [{ userId: dana._id, shiftTypeId: morning._id, date: monday.toISOString() }] },
        }));
        restore = net.restore;
        clearInFlightRequests();
        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: dana, currentGroup: group, isShiftManager: true, setCurrentGroup: vi.fn(), isAdmin: false,
            login: vi.fn(), logout: vi.fn(), switchGroup: vi.fn(), isRestoringSession: false,
        });
        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            users: [dana], groups: [group], sites: [], phones: [], setSites: vi.fn(), setPhones: vi.fn(), setUsers: vi.fn(),
            setGroups: vi.fn(), refreshData: vi.fn(), loadError: null, retry: vi.fn(), loading: false,
        });
        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({ showNotification: vi.fn() });

        // StrictMode runs the load effect, aborts it, and runs it again on mount
        render(
            <React.StrictMode>
                <ShiftSchedulePage />
            </React.StrictMode>,
        );

        expect(await screen.findByRole("button", { name: `Dana - ${format(monday, "EEEE dd/MM/yyyy")}: Morning` })).toBeInTheDocument();
        expect(screen.getByText("PUBLISHED")).toBeInTheDocument();
    });
});
