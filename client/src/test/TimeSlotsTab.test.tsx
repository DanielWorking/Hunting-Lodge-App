import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AxiosError, type AxiosResponse } from "axios";
import TimeSlotsTab from "../components/settings/TimeSlotsTab";
import GroupSettingsPage from "../pages/GroupSettingsPage";
import { updateGroupSettings } from "../api/groupsApi";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import type { Group, ShiftType, TimeSlot } from "../types";

vi.mock("../api/groupsApi", () => ({
    updateGroupSettings: vi.fn().mockResolvedValue({}),
}));

describe("TimeSlotsTab Warning Alert & Advisory", () => {
    const mockShiftTypes: ShiftType[] = [
        {
            _id: "st-working",
            name: "Morning Shift",
            color: "#4caf50",
            isVacation: false,
        },
        {
            _id: "st-vacation",
            name: "Annual Vacation",
            color: "#ff9800",
            isVacation: true,
        },
    ];

    const mockTimeSlots: TimeSlot[] = [
        {
            _id: "slot-1",
            name: "Morning",
            startTime: "08:00",
            endTime: "16:00",
            linkedShiftTypes: ["st-working"],
        },
    ];

    const mockGroup: Group = {
        _id: "group-1",
        name: "Security Alpha",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["HQ"],
        settings: {
            shiftTypes: mockShiftTypes,
            timeSlots: mockTimeSlots,
        },
    };

    const mockShowNotification = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: {
                _id: "user-1",
                username: "cmd",
                displayName: "Commander",
                isActive: true,
                vacationBalance: 10,
                groups: [],
            },
            currentGroup: mockGroup,
            setCurrentGroup: vi.fn(),
            isAdmin: true,
            isShiftManager: true,
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [],
            setSites: vi.fn(),
            phones: [],
            setPhones: vi.fn(),
            users: [],
            setUsers: vi.fn(),
            groups: [mockGroup],
            loading: false,
            refreshData: vi.fn(),
            loadError: null,
            retry: vi.fn(),
        });

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: mockShowNotification,
        });
    });

    it("renders the prominent warning alert instructing managers not to link vacation shifts", () => {
        render(<TimeSlotsTab />);

        const alertElement = screen.getByRole("alert");
        expect(alertElement).toBeInTheDocument();
        expect(alertElement).toHaveTextContent("Important: Active Duty Time Slots Only");
        expect(alertElement).toHaveTextContent("Do not assign or link time slots to non-working shift types");
        expect(alertElement).toHaveTextContent("Vacation");
    });

    it("displays corrected slot name label and preventive helper text in the Add Slot dialog", () => {
        render(<TimeSlotsTab />);

        const addSlotButton = screen.getByRole("button", { name: /add slot/i });
        fireEvent.click(addSlotButton);

        // Check dialog title
        expect(screen.getByText("New Time Slot")).toBeInTheDocument();

        // Check that Slot Name has corrected label and does NOT say 'Vacation / Morning'
        const nameField = screen.getByLabelText(/Slot Name \(e\.g\. Morning Shift \/ Night Shift\)/i);
        expect(nameField).toBeInTheDocument();
        expect(screen.queryByLabelText(/Vacation \/ Morning/i)).not.toBeInTheDocument();

        // Check helper text for Linked Shift Types
        expect(
            screen.getByText("Only link active working shifts. Do not assign non-working shift types (e.g., Vacation or Leave)."),
        ).toBeInTheDocument();
    });

    it("lists vacation shift types as disabled in the linked shift types picker", () => {
        render(<TimeSlotsTab />);
        fireEvent.click(screen.getByRole("button", { name: /add slot/i }));

        fireEvent.mouseDown(screen.getByRole("combobox", { name: /linked shift types/i }));

        expect(screen.getByRole("option", { name: /annual vacation/i })).toHaveAttribute("aria-disabled", "true");
        expect(screen.getByText("Vacation: can't be linked to a time slot")).toBeInTheDocument();
        expect(screen.getByRole("option", { name: /morning shift/i })).not.toHaveAttribute("aria-disabled");
    });

    it("shows the server's reason when it refuses to save a time slot", async () => {
        const reason = 'Time slot "Morning" cannot be linked to the vacation shift type "Annual Vacation"';
        vi.mocked(updateGroupSettings).mockRejectedValueOnce(
            new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
                status: 400,
                data: {
                    message: `Group validation failed: settings.timeSlots.0.linkedShiftTypes: ${reason}`,
                    code: "VALIDATION_ERROR",
                    errors: [{ field: "settings.timeSlots.0.linkedShiftTypes", message: reason }],
                },
            } as AxiosResponse),
        );
        render(<TimeSlotsTab />);

        fireEvent.click(screen.getByLabelText(/Edit time slot Morning/i));
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

        await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith(reason, "error"));
    });

    it("verifies accessible tab and tabpanel attributes in GroupSettingsPage", () => {
        render(
            <MemoryRouter>
                <GroupSettingsPage />
            </MemoryRouter>,
        );

        // Tab navigation accessible attributes
        const timeSlotsTab = screen.getByRole("tab", { name: /time slots/i });
        expect(timeSlotsTab).toHaveAttribute("id", "group-settings-tab-1");
        expect(timeSlotsTab).toHaveAttribute("aria-controls", "group-settings-tabpanel-1");

        // Active tabpanel
        const tabPanel = screen.getByRole("tabpanel");
        expect(tabPanel).toBeInTheDocument();
    });
});
