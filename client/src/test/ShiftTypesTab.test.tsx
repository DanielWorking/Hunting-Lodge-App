import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";
import ShiftTypesTab from "../components/settings/ShiftTypesTab";
import { updateGroupSettings } from "../api/groupsApi";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import type { Group, ShiftType, TimeSlot } from "../types";

vi.mock("../api/groupsApi", () => ({
    updateGroupSettings: vi.fn().mockResolvedValue({}),
}));

describe("ShiftTypesTab: vacation types and time slots", () => {
    const mockShiftTypes: ShiftType[] = [
        { _id: "st-morning", name: "Morning Shift", color: "#4caf50", isVacation: false },
        { _id: "st-reserve", name: "Reserve", color: "#2196f3", isVacation: false },
        { _id: "st-vacation", name: "Annual Vacation", color: "#ff9800", isVacation: true },
    ];

    const mockTimeSlots: TimeSlot[] = [
        { _id: "slot-1", name: "Morning", startTime: "08:00", endTime: "16:00", linkedShiftTypes: ["st-morning"] },
    ];

    const mockGroup: Group = {
        _id: "group-1",
        name: "Security Alpha",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["HQ"],
        settings: { shiftTypes: mockShiftTypes, timeSlots: mockTimeSlots },
    };

    const mockShowNotification = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: { _id: "user-1", username: "cmd", displayName: "Commander", isActive: true, vacationBalance: 10, groups: [] },
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
            loadError: null,
            retry: vi.fn(),
        });

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: mockShowNotification,
        });
    });

    it("won't mark a shift type as vacation while a time slot links it, and names the slot", () => {
        render(<ShiftTypesTab />);
        fireEvent.click(screen.getByLabelText("Edit shift type Morning Shift"));

        expect(screen.getByRole("checkbox", { name: /reduces vacation balance/i })).toBeDisabled();
        expect(screen.getByText(/Linked to time slot Morning\. Unlink it there before marking it as vacation\./)).toBeInTheDocument();
    });

    it("lets an unlinked shift type be marked as vacation", () => {
        render(<ShiftTypesTab />);
        fireEvent.click(screen.getByLabelText("Edit shift type Reserve"));

        const checkbox = screen.getByRole("checkbox", { name: /reduces vacation balance/i });
        expect(checkbox).toBeEnabled();
        expect(screen.queryByText(/Unlink it there/)).not.toBeInTheDocument();
    });

    it("shows the server's reason when it refuses to save a shift type", async () => {
        const reason = 'Time slot "Morning" cannot be linked to the vacation shift type "Morning Shift"';
        vi.mocked(updateGroupSettings).mockRejectedValueOnce(
            new AxiosError("Request failed with status code 400", "ERR_BAD_REQUEST", undefined, undefined, {
                status: 400,
                data: { message: "Validation failed", code: "VALIDATION_ERROR", errors: [{ field: "settings.timeSlots.0.linkedShiftTypes", message: reason }] },
            } as AxiosResponse),
        );
        vi.spyOn(console, "error").mockImplementation(() => {});
        render(<ShiftTypesTab />);

        fireEvent.click(screen.getByLabelText("Edit shift type Reserve"));
        fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

        await waitFor(() => expect(mockShowNotification).toHaveBeenCalledWith(reason, "error"));
    });
});
