import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import PhonesPage from "../pages/PhonesPage";
import * as NotificationContextModule from "../context/NotificationContext";
import * as UserContextModule from "../context/UserContext";
import * as phonesApi from "../api/phonesApi";
import type { PhoneRow, Group, User } from "../types";

vi.mock("../api/phonesApi", () => ({
    getPhones: vi.fn().mockResolvedValue({ data: [] }),
    createPhone: vi.fn().mockResolvedValue({ data: {} }),
    updatePhone: vi.fn().mockResolvedValue({ data: {} }),
    deletePhone: vi.fn().mockResolvedValue({ data: {} }),
    toggleFavoritePhone: vi.fn().mockResolvedValue({ data: { favoritePhones: ["phone-1"] } }),
}));

let currentPhones: PhoneRow[] = [];
const mockSetPhones = vi.fn((updater: React.SetStateAction<PhoneRow[]>) => {
    if (typeof updater === "function") {
        currentPhones = updater(currentPhones);
    } else {
        currentPhones = updater;
    }
});
const mockRefreshData = vi.fn();

vi.mock("../context/DataContext", () => ({
    useData: () => ({
        phones: currentPhones,
        setPhones: mockSetPhones,
        loading: false,
        refreshData: mockRefreshData,
        sites: [],
        setSites: vi.fn(),
        users: [],
        setUsers: vi.fn(),
        groups: [],
        setGroups: vi.fn(),
    }),
}));

describe("PhonesPage - Favorite Icon UI Update Regression Test Suite", () => {
    const mockUser: User = {
        _id: "user-1",
        username: "danie",
        displayName: "Daniel Reifer",
        isActive: true,
        vacationBalance: 12,
        groups: [{ groupId: "group-1", role: "shift_manager" }],
    };

    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["HQ"],
        settings: {
            shiftTypes: [],
            timeSlots: [],
        },
    };

    const showNotificationMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        currentPhones = [
            {
                _id: "phone-1",
                name: "Command Desk",
                numbers: ["050-123-4567"],
                type: "Mobile",
                description: "Primary hotline",
                isFavorite: false,
            },
        ];

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: showNotificationMock,
        });

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: mockUser,
            currentGroup: mockGroup,
            setCurrentGroup: vi.fn(),
            isAdmin: true,
            isShiftManager: true,
            login: vi.fn(),
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });
    });

    it("optimistically toggles favorite icon to filled state and displays success toast when clicked", async () => {
        const { rerender } = render(
            <MemoryRouter>
                <PhonesPage />
            </MemoryRouter>,
        );

        const favoriteBtn = screen.getByLabelText("Add Command Desk to favorites");
        expect(favoriteBtn).toBeInTheDocument();

        fireEvent.click(favoriteBtn);

        await waitFor(() => {
            expect(showNotificationMock).toHaveBeenCalledWith(
                "Added to favorites",
                "success",
            );
        });

        expect(mockSetPhones).toHaveBeenCalled();
        expect(currentPhones[0].isFavorite).toBe(true);

        rerender(
            <MemoryRouter>
                <PhonesPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(
                screen.getByLabelText("Remove Command Desk from favorites"),
            ).toBeInTheDocument();
        });
    });

    it("blocks rapid concurrent clicks while a toggle request is inflight", async () => {
        let resolveToggle: (val: unknown) => void = () => {};
        const togglePromise = new Promise((resolve) => {
            resolveToggle = resolve;
        });
        vi.mocked(phonesApi.toggleFavoritePhone).mockReturnValue(
            togglePromise as unknown as ReturnType<typeof phonesApi.toggleFavoritePhone>,
        );

        render(
            <MemoryRouter>
                <PhonesPage />
            </MemoryRouter>,
        );

        const favoriteBtn = screen.getByLabelText("Add Command Desk to favorites");

        // Fire two clicks in rapid succession
        fireEvent.click(favoriteBtn);
        fireEvent.click(favoriteBtn);

        // Only one network call should have been initiated
        expect(phonesApi.toggleFavoritePhone).toHaveBeenCalledTimes(1);

        resolveToggle({ data: { favoritePhones: ["phone-1"] } });
    });

    it("reverts optimistic state update and displays error toast when API rejects", async () => {
        vi.mocked(phonesApi.toggleFavoritePhone).mockRejectedValueOnce(
            new Error("Network connection lost"),
        );

        const { rerender } = render(
            <MemoryRouter>
                <PhonesPage />
            </MemoryRouter>,
        );

        const favoriteBtn = screen.getByLabelText("Add Command Desk to favorites");
        fireEvent.click(favoriteBtn);

        await waitFor(() => {
            expect(showNotificationMock).toHaveBeenCalledWith(
                "Failed to update favorite",
                "error",
            );
        });

        // Current state must be reverted to isFavorite: false
        expect(currentPhones[0].isFavorite).toBe(false);

        rerender(
            <MemoryRouter>
                <PhonesPage />
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(
                screen.getByLabelText("Add Command Desk to favorites"),
            ).toBeInTheDocument();
        });
    });
});
