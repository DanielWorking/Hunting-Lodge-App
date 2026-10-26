import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import ShiftSchedulePage from "../pages/ShiftSchedulePage";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import { getSchedule, saveSchedule, publishSchedule } from "../api/schedulesApi";
import { RateLimitError } from "../api/apiClient";
import type { Group, User } from "../types";

vi.mock("../api/schedulesApi", () => ({
    getSchedule: vi.fn(),
    getAllSchedules: vi.fn(),
    saveSchedule: vi.fn(),
    publishSchedule: vi.fn(),
}));

const MORNING = { _id: "type-morning", name: "Morning", color: "#1976d2", isVacation: false };
const group: Group = {
    _id: "group-1",
    name: "Alpha",
    members: [],
    createdAt: "",
    settings: { shiftTypes: [MORNING], timeSlots: [] },
};
const dana: User = { _id: "user-dana", username: "dana", displayName: "Dana", isActive: true, groups: [{ groupId: "group-1", role: "member" }] };
const former: User = { _id: "user-former", username: "former", displayName: "Former", isActive: false, groups: [{ groupId: "group-1", role: "member" }] };

const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
const monday = addDays(weekStart, 1);
const tuesday = addDays(weekStart, 2);
const cellName = (user: User, day: Date) => `${user.displayName} - ${format(day, "EEEE dd/MM/yyyy")}`;

const ok = <T,>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: new AxiosHeaders() },
});

const httpError = (status: number, data: unknown = {}, headers: Record<string, string> = {}) =>
    new AxiosError("Request failed", "ERR_BAD_RESPONSE", undefined, undefined, {
        status,
        data,
        statusText: "",
        headers,
        config: { headers: new AxiosHeaders() },
    });

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const shiftOf = (user: User, day: Date) => ({ userId: user._id, shiftTypeId: MORNING._id, date: day.toISOString(), vacationValue: 1 });

const view = (overrides: Record<string, unknown> = {}) => ({
    _id: "sched-1",
    groupId: "group-1",
    startDate: weekStart.toISOString(),
    endDate: endOfWeek(weekStart, { weekStartsOn: 0 }).toISOString(),
    isPublished: true,
    hasUnpublishedChanges: false,
    revision: 4,
    shifts: [shiftOf(dana, monday)],
    ...overrides,
});

const showNotification = vi.fn();
const refreshData = vi.fn();

function mockContexts(currentGroup: Group = group, notify: typeof showNotification = showNotification) {
    vi.spyOn(UserContextModule, "useUser").mockReturnValue({
        user: dana,
        currentGroup,
        isShiftManager: true,
        setCurrentGroup: vi.fn(),
        isAdmin: false,
        logout: vi.fn(),
        switchGroup: vi.fn(),
        isRestoringSession: false,
    });
    vi.spyOn(DataContextModule, "useData").mockReturnValue({
        users: [dana, former],
        groups: [group],
        sites: [],
        phones: [],
        setSites: vi.fn(),
        setPhones: vi.fn(),
        setUsers: vi.fn(),
        refreshData,
        loadError: null,
        retry: vi.fn(),
        loading: false,
    });
    vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({ showNotification: notify });
}

const saveButton = () => screen.getByRole("button", { name: /save draft/i });
const publishButton = () => screen.getByRole("button", { name: /^(update & )?publish$/i });

/** Assigns the Morning shift to `user` on `day` through the cell menu. */
function assignMorning(user: User, day: Date) {
    fireEvent.click(screen.getByRole("button", { name: cellName(user, day) }));
    fireEvent.click(screen.getByRole("menuitem", { name: /morning/i }));
}

async function renderLoaded(data: Record<string, unknown>) {
    vi.mocked(getSchedule).mockResolvedValue(ok(data));
    render(<ShiftSchedulePage />);
    await screen.findByRole("button", { name: `${cellName(dana, monday)}: Morning` });
}

describe("ShiftSchedulePage: loading the week", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockContexts();
    });

    it("does not reload when the group object or the notification function change identity", async () => {
        vi.mocked(getSchedule).mockResolvedValue(ok(view()));
        const { rerender } = render(<ShiftSchedulePage />);
        await screen.findByRole("button", { name: `${cellName(dana, monday)}: Morning` });

        mockContexts({ ...group }, vi.fn());
        rerender(<ShiftSchedulePage />);
        await act(async () => {});

        expect(getSchedule).toHaveBeenCalledTimes(1);
    });

    it("ignores a response that is no longer the latest request", async () => {
        const first = deferred<AxiosResponse>();
        const nextMonday = addDays(monday, 7);
        vi.mocked(getSchedule)
            .mockReturnValueOnce(first.promise as never)
            .mockResolvedValueOnce(ok(view({ _id: "sched-2", shifts: [shiftOf(dana, nextMonday)] })));
        render(<ShiftSchedulePage />);

        fireEvent.click(screen.getByRole("button", { name: "Next week" }));
        await screen.findByRole("button", { name: `${cellName(dana, nextMonday)}: Morning` });
        await act(async () => {
            first.resolve(ok(view({ shifts: [] })));
        });

        expect(screen.getByRole("button", { name: `${cellName(dana, nextMonday)}: Morning` })).toBeInTheDocument();
    });

    it("shows an inline error with Retry after a failed load, and never retries on its own", async () => {
        vi.mocked(getSchedule).mockRejectedValueOnce(httpError(500)).mockResolvedValueOnce(ok(view()));
        render(<ShiftSchedulePage />);

        await screen.findByText(/couldn't load this week/i);
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
        });
        expect(getSchedule).toHaveBeenCalledTimes(1);
        expect(showNotification).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        await screen.findByRole("button", { name: `${cellName(dana, monday)}: Morning` });
        expect(getSchedule).toHaveBeenCalledTimes(2);
    });

    it("clears the previous week's schedule as soon as the week changes", async () => {
        await renderLoaded(view());
        vi.mocked(getSchedule).mockReturnValue(new Promise(() => {}) as never);

        fireEvent.click(screen.getByRole("button", { name: "Next week" }));

        expect(screen.queryByRole("button", { name: `${cellName(dana, monday)}: Morning` })).not.toBeInTheDocument();
        expect(screen.queryByText("PUBLISHED")).not.toBeInTheDocument();
    });

    it("disables Save Draft and Publish while loading and after a failed load", async () => {
        const pending = deferred<AxiosResponse>();
        vi.mocked(getSchedule).mockReturnValueOnce(pending.promise as never);
        render(<ShiftSchedulePage />);
        expect(saveButton()).toBeDisabled();
        expect(publishButton()).toBeDisabled();

        await act(async () => {
            pending.reject(httpError(503));
        });
        await screen.findByText(/couldn't load this week/i);
        expect(saveButton()).toBeDisabled();
        expect(publishButton()).toBeDisabled();
    });

    it("shows the rate-limit delay inline when the load is refused with 429", async () => {
        vi.mocked(getSchedule).mockRejectedValueOnce(
            new RateLimitError(httpError(429, { message: "Too many requests" }, { "retry-after": "120" })),
        );
        render(<ShiftSchedulePage />);

        expect(await screen.findByText(/try again in 2 minutes/i)).toBeInTheDocument();
    });
});

describe("ShiftSchedulePage: saving and publishing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockContexts();
    });

    it("builds the grid from the PUT response, with no reload", async () => {
        await renderLoaded(view({ isPublished: false }));
        assignMorning(dana, tuesday);
        vi.mocked(saveSchedule).mockResolvedValue(ok(view({ isPublished: false, revision: 5, shifts: [shiftOf(dana, monday), shiftOf(dana, tuesday)] })));

        fireEvent.click(saveButton());

        await waitFor(() => expect(showNotification).toHaveBeenCalledWith("Schedule saved as Draft", "success"));
        expect(getSchedule).toHaveBeenCalledTimes(1);
        expect(screen.getByRole("button", { name: `${cellName(dana, tuesday)}: Morning` })).toBeInTheDocument();
        expect(saveButton()).toBeDisabled();
    });

    it("saves under the loaded schedule's own range when it covers the displayed week", async () => {
        const savedFromAnotherZone = new Date(weekStart.getTime() - 3 * 3600 * 1000).toISOString();
        await renderLoaded(view({ isPublished: false, startDate: savedFromAnotherZone }));
        assignMorning(dana, tuesday);
        vi.mocked(saveSchedule).mockResolvedValue(ok(view({ isPublished: false })));

        fireEvent.click(saveButton());

        await waitFor(() => expect(saveSchedule).toHaveBeenCalled());
        expect(vi.mocked(saveSchedule).mock.calls[0][0].startDate).toBe(savedFromAnotherZone);
    });

    it("sends one PUT for a double click", async () => {
        await renderLoaded(view({ isPublished: false }));
        assignMorning(dana, tuesday);
        const pending = deferred<AxiosResponse>();
        vi.mocked(saveSchedule).mockReturnValue(pending.promise as never);

        fireEvent.click(saveButton());
        fireEvent.click(saveButton());
        await act(async () => {
            pending.resolve(ok(view({ isPublished: false })));
        });

        expect(saveSchedule).toHaveBeenCalledTimes(1);
    });

    it("shows the rate-limit message once when a save is refused with 429", async () => {
        await renderLoaded(view({ isPublished: false }));
        assignMorning(dana, tuesday);
        vi.mocked(saveSchedule).mockRejectedValue(
            new RateLimitError(httpError(429, { message: "Too many requests" }, { "retry-after": "120" })),
        );

        fireEvent.click(saveButton());

        await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
        expect(showNotification).toHaveBeenCalledWith("Too many requests. Please try again in 2 minutes.", "error");
        expect(getSchedule).toHaveBeenCalledTimes(1);
    });

    it("disables both buttons on a published week with nothing changed, and clicking sends nothing", async () => {
        await renderLoaded(view());

        expect(saveButton()).toBeDisabled();
        expect(publishButton()).toBeDisabled();
        fireEvent.click(publishButton());
        fireEvent.click(saveButton());
        expect(saveSchedule).not.toHaveBeenCalled();
        expect(publishSchedule).not.toHaveBeenCalled();
    });

    it("undoing an edit makes the week unchanged again", async () => {
        await renderLoaded(view());
        assignMorning(dana, tuesday);
        expect(publishButton()).toBeEnabled();

        fireEvent.click(screen.getByRole("button", { name: `${cellName(dana, tuesday)}: Morning` }));
        fireEvent.click(screen.getByRole("menuitem", { name: /clear shift/i }));

        expect(publishButton()).toBeDisabled();
    });

    it("publishes a saved draft directly, without a PUT, and shows the published result", async () => {
        await renderLoaded(view({ hasUnpublishedChanges: true }));
        vi.mocked(publishSchedule).mockResolvedValue(ok(view({ revision: 5 })));

        fireEvent.click(publishButton());
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish" }));

        await waitFor(() => expect(publishSchedule).toHaveBeenCalledWith("sched-1", 4));
        expect(saveSchedule).not.toHaveBeenCalled();
        await waitFor(() => expect(showNotification).toHaveBeenCalledWith("Schedule Published Successfully!", "success"));
        expect(refreshData).toHaveBeenCalledTimes(1);
        expect(getSchedule).toHaveBeenCalledTimes(1);
    });

    it("publishes an unchanged unpublished week without a PUT", async () => {
        await renderLoaded(view({ isPublished: false }));
        vi.mocked(publishSchedule).mockResolvedValue(ok(view()));

        fireEvent.click(publishButton());
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish" }));

        await waitFor(() => expect(publishSchedule).toHaveBeenCalled());
        expect(saveSchedule).not.toHaveBeenCalled();
    });

    it("saves only the shifts of members shown in the grid", async () => {
        const unknownUser = { userId: "user-gone", shiftTypeId: MORNING._id, date: monday.toISOString(), vacationValue: 1 };
        await renderLoaded(view({ isPublished: false, shifts: [shiftOf(dana, monday), shiftOf(former, monday), unknownUser] }));
        assignMorning(dana, tuesday);
        vi.mocked(saveSchedule).mockResolvedValue(ok(view({ isPublished: false })));

        fireEvent.click(saveButton());

        await waitFor(() => expect(saveSchedule).toHaveBeenCalled());
        const sent = vi.mocked(saveSchedule).mock.calls[0][0].shifts as Array<{ userId: string }>;
        expect(sent.map((s) => s.userId)).toEqual([dana._id, dana._id]);
    });

    it("a hidden member's shifts never make the week look changed", async () => {
        await renderLoaded(view({ shifts: [shiftOf(dana, monday), shiftOf(former, monday)] }));

        expect(publishButton()).toBeDisabled();
    });
});
