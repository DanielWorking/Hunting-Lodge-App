import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../components/Navbar";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import type { Group } from "../types";

describe("ProfileMenu / AccountMenu in Navbar", () => {
    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        settings: {
            shiftTypes: [],
            timeSlots: [],
        },
    };

    const mockUser = {
        _id: "user-1",
        username: "danie",
        displayName: "Daniel Reifer",
        isActive: true,
        vacationBalance: 10,
        groups: [{ groupId: "group-1", role: "member" as const }],
    };

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: vi.fn(),
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [],
            setSites: vi.fn(),
            phones: [],
            setPhones: vi.fn(),
            users: [mockUser],
            setUsers: vi.fn(),
            groups: [mockGroup],
            setGroups: vi.fn(),
            loading: false,
            refreshData: vi.fn(),
        });

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: mockUser,
            currentGroup: mockGroup,
            setCurrentGroup: vi.fn(),
            isAdmin: false,
            isShiftManager: false,
            login: vi.fn(),
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });
    });

    it("renders user greeting, switch group options, and logout button", async () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );

        // Click on the user avatar to open the account menu
        const avatarButton = screen.getByLabelText("Account menu and group switcher");
        fireEvent.click(avatarButton);

        const accountMenu = await screen.findByRole("menu");
        expect(accountMenu).toBeInTheDocument();

        // Check user greeting
        expect(within(accountMenu).getByText(/Hi, Daniel Reifer/i)).toBeInTheDocument();

        // Check switch group section
        expect(within(accountMenu).getByText(/Switch Group:/i)).toBeInTheDocument();
        expect(within(accountMenu).getByText("Command Center")).toBeInTheDocument();

        // Check Logout
        expect(within(accountMenu).getByRole("menuitem", { name: /Logout/i })).toBeInTheDocument();
    });

    it("does NOT render 'About & Support' inside the user account menu to prevent duplicates", async () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );

        // Click on the user avatar to open the account menu
        const avatarButton = screen.getByLabelText("Account menu and group switcher");
        fireEvent.click(avatarButton);

        const accountMenu = await screen.findByRole("menu");
        expect(accountMenu).toBeInTheDocument();

        // Should NOT have About & Support menu item inside the account menu
        const aboutMenuItem = within(accountMenu).queryByRole("menuitem", {
            name: /About & Support/i,
        });
        expect(aboutMenuItem).not.toBeInTheDocument();
    });

    it("renders the standalone 'About & Support' icon button in the navbar toolbar", () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );

        const aboutToolbarBtn = screen.getByRole("button", {
            name: "About & Support",
        });
        expect(aboutToolbarBtn).toBeInTheDocument();
    });
});
