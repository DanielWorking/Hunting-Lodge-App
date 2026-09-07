import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ShiftReportPage from "../pages/ShiftReportPage";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import { getReports, updateReport } from "../api/reportsApi";
import type { User, Group, ShiftReport } from "../types";
import { format } from "date-fns";
import { AxiosHeaders, type AxiosResponse } from "axios";

const createMockAxiosResponse = <T,>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {
        headers: new AxiosHeaders(),
    },
});

// Mock external dependencies and APIs
vi.mock("../api/reportsApi", () => ({
    getReports: vi.fn(),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(),
}));

// Mock tiptap to avoid DOM/Canvas issues in testing
vi.mock("@tiptap/react", () => ({
    useEditor: () => null,
    EditorContent: () => <div data-testid="mock-tiptap-editor" />,
}));

describe("ShiftReportPage - Background Polling State Shielding", () => {
    const mockUser1: User = {
        _id: "user-1",
        username: "danie",
        displayName: "Daniel Reifer",
        isActive: true,
        vacationBalance: 10,
        groups: [{ groupId: "group-1", role: "shift_manager" }],
    };

    const mockUser2: User = {
        _id: "user-2",
        username: "alice",
        displayName: "Alice Smith",
        isActive: true,
        vacationBalance: 15,
        groups: [{ groupId: "group-1", role: "member" }],
    };

    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1", "user-2"],
        createdAt: new Date().toISOString(),
        settings: {
            shiftTypes: [],
            timeSlots: [],
        },
    };

    const mockReports: ShiftReport[] = [
        {
            _id: "report-1",
            groupId: "group-1",
            title: "Morning Shift Report",
            date: "2026-09-07T08:00:00Z",
            startTime: "2026-09-07T08:00:00Z",
            endTime: "2026-09-07T16:00:00Z",
            attendees: [
                {
                    userId: "user-1",
                    name: "Daniel Reifer",
                    isManual: true,
                },
            ],
            previousTasks: "<p>Previous tasks log</p>",
            currentTasks: "<p>Current tasks log</p>",
            isLocked: false,
        },
        {
            _id: "report-2",
            groupId: "group-1",
            title: "Night Shift Report",
            date: "2026-09-06T20:00:00Z",
            startTime: "2026-09-06T20:00:00Z",
            endTime: "2026-09-07T04:00:00Z",
            attendees: [
                {
                    userId: "user-2",
                    name: "Alice Smith",
                    isManual: true,
                },
            ],
            previousTasks: "",
            currentTasks: "",
            isLocked: false,
        },
    ];

    const mockShowNotification = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: mockShowNotification,
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            users: [mockUser1, mockUser2],
            groups: [mockGroup],
            sites: [],
            phones: [],
            setSites: vi.fn(),
            setPhones: vi.fn(),
            setUsers: vi.fn(),
            setGroups: vi.fn(),
            refreshData: vi.fn(),
            loading: false,
        });

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: mockUser1,
            currentGroup: mockGroup,
            isShiftManager: true,
            setCurrentGroup: vi.fn(),
            isAdmin: false,
            login: vi.fn().mockResolvedValue(true),
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should NOT revert active member modifications back to the original list when background polling occurs", async () => {
        vi.mocked(getReports).mockResolvedValue(createMockAxiosResponse([...mockReports]));
        vi.mocked(updateReport).mockResolvedValue(createMockAxiosResponse(mockReports[0]));

        render(
            <MemoryRouter>
                <ShiftReportPage />
            </MemoryRouter>
        );

        // 1. Wait for initial reports to load and first report to be displayed
        await waitFor(() => {
            expect(screen.getByText("Morning Shift Report")).toBeInTheDocument();
        });

        // Confirm Daniel Reifer is initially rendered as an attendee chip
        expect(screen.getByText("Daniel Reifer")).toBeInTheDocument();

        // 2. Modify active members by deleting the attendee chip (click delete icon)
        const deleteChipButton = screen.getByTestId("CancelIcon");
        fireEvent.click(deleteChipButton);

        // Verify the attendee was removed in the UI
        expect(screen.queryByText("Daniel Reifer")).not.toBeInTheDocument();

        // 3. Advance timer by 30 seconds to trigger the polling interval
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30000);
        });

        // Polling triggered
        expect(getReports).toHaveBeenCalledTimes(2);

        // 4. ASSERTION: The attendee removal must NOT revert back to having "Daniel Reifer"
        // In the unshielded code, this fails because polling resets selectedReport to res.data[0]
        expect(screen.queryByText("Daniel Reifer")).not.toBeInTheDocument();

        // 5. Click Save and verify updated attendees persist
        const saveButton = screen.getByRole("button", { name: /save report/i });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(updateReport).toHaveBeenCalledWith(
                "report-1",
                expect.objectContaining({
                    attendees: [],
                })
            );
        });
    });

    it("should NOT revert the selected report back to report-1 when a different report is chosen", async () => {
        vi.mocked(getReports).mockResolvedValue(createMockAxiosResponse([...mockReports]));

        render(
            <MemoryRouter>
                <ShiftReportPage />
            </MemoryRouter>
        );

        // Wait for initial load
        await waitFor(() => {
            expect(screen.getByText("Morning Shift Report")).toBeInTheDocument();
        });

        const report2Date = new Date(mockReports[1].startTime);
        const report2Year = String(report2Date.getFullYear());
        const report2Month = report2Date.toLocaleString("default", { month: "long" });
        const report2Day = format(report2Date, "dd/MM/yyyy");

        // Expand sidebar archive tree: Year -> Month -> Day
        fireEvent.click(screen.getByText(report2Year));
        await waitFor(() => {
            expect(screen.getByText(report2Month)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText(report2Month));
        await waitFor(() => {
            expect(screen.getByText(report2Day)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText(report2Day));
        await waitFor(() => {
            expect(screen.getByText("Night Shift Report")).toBeInTheDocument();
        });

        // Select the second report from the sidebar
        const secondReportListItem = screen.getByText("Night Shift Report").closest('[role="button"]');
        expect(secondReportListItem).not.toBeNull();
        fireEvent.click(secondReportListItem!);

        // Heading should now show "Night Shift Report"
        await waitFor(() => {
            const heading = screen.getAllByRole("heading", { level: 2 }).find(
                (h) => h.textContent === "Night Shift Report"
            );
            expect(heading).toBeInTheDocument();
        });

        // Advance 30 seconds for background poll
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30000);
        });

        expect(getReports).toHaveBeenCalledTimes(2);

        // Selected report must STILL be Night Shift Report, NOT reverted back to Morning Shift Report
        const headingAfterPoll = screen.getAllByRole("heading", { level: 2 }).find(
            (h) => h.textContent === "Night Shift Report"
        );
        expect(headingAfterPoll).toBeInTheDocument();
    });

    it("should allow discarding unsaved member modifications", async () => {
        vi.mocked(getReports).mockResolvedValue(createMockAxiosResponse([...mockReports]));

        render(
            <MemoryRouter>
                <ShiftReportPage />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText("Daniel Reifer")).toBeInTheDocument();
        });

        // Remove attendee
        const deleteChipButton = screen.getByTestId("CancelIcon");
        fireEvent.click(deleteChipButton);
        expect(screen.queryByText("Daniel Reifer")).not.toBeInTheDocument();

        // Click Discard
        const discardButton = screen.getByRole("button", { name: /discard/i });
        fireEvent.click(discardButton);

        // Should revert back to original attendee list
        await waitFor(() => {
            expect(screen.getByText("Daniel Reifer")).toBeInTheDocument();
        });
    });

    it("should prompt confirmation before switching reports when unsaved changes exist", async () => {
        vi.mocked(getReports).mockResolvedValue(createMockAxiosResponse([...mockReports]));

        render(
            <MemoryRouter>
                <ShiftReportPage />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText("Morning Shift Report")).toBeInTheDocument();
        });

        // Make an edit (remove attendee)
        const deleteChipButton = screen.getByTestId("CancelIcon");
        fireEvent.click(deleteChipButton);

        // Check unsaved changes badge is visible
        expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

        const report2Date = new Date(mockReports[1].startTime);
        const report2Year = String(report2Date.getFullYear());
        const report2Month = report2Date.toLocaleString("default", { month: "long" });
        const report2Day = format(report2Date, "dd/MM/yyyy");

        fireEvent.click(screen.getByText(report2Year));
        await waitFor(() => {
            expect(screen.getByText(report2Month)).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText(report2Month));
        await waitFor(() => {
            expect(screen.getByText(report2Day)).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText(report2Day));
        await waitFor(() => {
            expect(screen.getByText("Night Shift Report")).toBeInTheDocument();
        });

        // Click Night Shift Report in sidebar
        const secondReportListItem = screen.getByText("Night Shift Report").closest('[role="button"]');
        expect(secondReportListItem).not.toBeNull();
        fireEvent.click(secondReportListItem!);

        // Confirmation dialog should appear
        await waitFor(() => {
            expect(
                screen.getByText(
                    "You have unsaved changes in this shift report. Do you want to discard your changes and switch to another report?"
                )
            ).toBeInTheDocument();
        });

        // Cancel the switch
        const cancelButton = screen.getByRole("button", { name: /cancel/i });
        fireEvent.click(cancelButton);

        // Should still be on Morning Shift Report and attendee is still removed
        expect(screen.getByText("Morning Shift Report")).toBeInTheDocument();
        expect(screen.queryByText("Daniel Reifer")).not.toBeInTheDocument();

        // Click Night Shift Report again and this time confirm
        fireEvent.click(secondReportListItem!);
        await waitFor(() => {
            expect(
                screen.getByText(
                    "You have unsaved changes in this shift report. Do you want to discard your changes and switch to another report?"
                )
            ).toBeInTheDocument();
        });
        const confirmButton = screen.getByRole("button", { name: /confirm/i });
        fireEvent.click(confirmButton);

        // Should now be on Night Shift Report
        await waitFor(() => {
            const heading = screen.getAllByRole("heading", { level: 2 }).find(
                (h) => h.textContent === "Night Shift Report"
            );
            expect(heading).toBeInTheDocument();
        });
    });
});
