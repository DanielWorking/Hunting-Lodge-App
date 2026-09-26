import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TimeSlotsTab from "../components/settings/TimeSlotsTab";
import GroupSettingsPage from "../pages/GroupSettingsPage";
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
            login: vi.fn(),
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
            setGroups: vi.fn(),
            loading: false,
            refreshData: vi.fn(),
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

    it("displays dynamic warning alert in dialog when a slot has a vacation shift linked", () => {
        const vacationSlot: TimeSlot = {
            _id: "slot-vac",
            name: "Erroneous Slot",
            startTime: "09:00",
            endTime: "17:00",
            linkedShiftTypes: ["st-vacation"],
        };

        const groupWithVacationSlot: Group = {
            ...mockGroup,
            settings: {
                shiftTypes: mockShiftTypes,
                timeSlots: [vacationSlot],
            },
        };

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [],
            setSites: vi.fn(),
            phones: [],
            setPhones: vi.fn(),
            users: [],
            setUsers: vi.fn(),
            groups: [groupWithVacationSlot],
            setGroups: vi.fn(),
            loading: false,
            refreshData: vi.fn(),
        });

        render(<TimeSlotsTab />);

        // Click edit button for the slot
        const editButton = screen.getByLabelText(/Edit time slot Erroneous Slot/i);
        fireEvent.click(editButton);

        // Verify dynamic warning alert appears inside dialog
        expect(
            screen.getByText(/One or more selected shift types are marked as non-working \(vacation\)/i),
        ).toBeInTheDocument();
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
