import { useEffect } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AxiosError, AxiosHeaders } from "axios";
import App from "../App";
import { NotificationProvider, useNotification } from "../context/NotificationContext";
import { DataProvider, useData } from "../context/DataContext";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as sitesApi from "../api/sitesApi";
import * as phonesApi from "../api/phonesApi";
import * as groupsApi from "../api/groupsApi";
import * as usersApi from "../api/usersApi";
import { RateLimitError } from "../api/apiClient";

vi.mock("../api/sitesApi", () => ({ getSites: vi.fn() }));
vi.mock("../api/phonesApi", () => ({ getPhones: vi.fn() }));
vi.mock("../api/groupsApi", () => ({ getGroups: vi.fn() }));
vi.mock("../api/usersApi", () => ({ getUsers: vi.fn() }));

const rateLimited = () =>
    new RateLimitError(
        new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
            status: 429,
            data: { message: "Too many requests, please try again after 15 minutes", code: "RATE_LIMIT_EXCEEDED" },
            statusText: "",
            headers: { "retry-after": "300" },
            config: { headers: new AxiosHeaders() },
        }),
    );

const user = {
    _id: "user-1",
    username: "dana",
    isActive: true,
    groups: [{ groupId: "group-1", role: "member" as const }],
};

function mockUser() {
    vi.spyOn(UserContextModule, "useUser").mockReturnValue({
        user,
        currentGroup: null,
        setCurrentGroup: vi.fn(),
        isAdmin: false,
        isShiftManager: false,
        login: vi.fn(),
        logout: vi.fn(),
        switchGroup: vi.fn(),
        isRestoringSession: false,
    } as never);
}

describe("the notification API is stable", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("an effect that depends on showNotification runs once across showing and auto-hiding a toast", () => {
        vi.useFakeTimers();
        let effectRuns = 0;
        function Consumer() {
            const { showNotification } = useNotification();
            useEffect(() => {
                effectRuns++;
            }, [showNotification]);
            return <button onClick={() => showNotification("Error loading schedule", "error")}>notify</button>;
        }

        render(
            <NotificationProvider>
                <Consumer />
            </NotificationProvider>,
        );
        fireEvent.click(screen.getByRole("button", { name: "notify" }));
        expect(screen.getByText("Error loading schedule")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(7000);
        });

        expect(effectRuns).toBe(1);
    });
});

describe("a failed first load is explained, never retried on its own", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        localStorage.setItem("hunting_userId", "user-1");
        mockUser();
        vi.mocked(sitesApi.getSites).mockResolvedValue({ data: [] } as never);
        vi.mocked(phonesApi.getPhones).mockResolvedValue({ data: [] } as never);
        vi.mocked(usersApi.getUsers).mockResolvedValue({ data: [] } as never);
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    function Probe() {
        const { loadError, retry, groups } = useData();
        return (
            <div>
                <p data-testid="error">{loadError ? `${loadError.status}: ${loadError.message}` : "none"}</p>
                <p data-testid="groups">{groups.map((g) => g.name).join(",")}</p>
                <button onClick={retry}>retry</button>
            </div>
        );
    }

    it("records a 429 on groups with the retry delay, waits for Retry, then recovers", async () => {
        vi.mocked(groupsApi.getGroups)
            .mockRejectedValueOnce(rateLimited())
            .mockResolvedValueOnce({ data: [{ _id: "group-1", name: "Alpha", members: [], createdAt: "" }] } as never);

        render(
            <DataProvider>
                <Probe />
            </DataProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("429: Too many requests. Please try again in 5 minutes."));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        expect(groupsApi.getGroups).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: "retry" }));

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("none"));
        expect(screen.getByTestId("groups")).toHaveTextContent("Alpha");
        expect(groupsApi.getGroups).toHaveBeenCalledTimes(2);
    });

    it("reports an unreachable server", async () => {
        vi.mocked(groupsApi.getGroups).mockRejectedValue(new Error("Network Error"));

        render(
            <DataProvider>
                <Probe />
            </DataProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("The server could not be reached."));
    });

    it("the app shell shows the message full-page with Retry instead of an empty app", () => {
        const retry = vi.fn();
        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [], setSites: vi.fn(), phones: [], setPhones: vi.fn(), users: [], setUsers: vi.fn(),
            groups: [], setGroups: vi.fn(), loading: false, refreshData: vi.fn(),
            loadError: { status: 429, message: "Too many requests. Please try again in 5 minutes." },
            retry,
        });

        render(
            <MemoryRouter initialEntries={["/schedule"]}>
                <NotificationProvider>
                    <App />
                </NotificationProvider>
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { name: "Couldn't load your data" })).toBeInTheDocument();
        expect(screen.getByText("Too many requests. Please try again in 5 minutes.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
