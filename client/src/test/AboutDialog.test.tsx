import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AboutDialog from "../components/AboutDialog";
import Navbar from "../components/Navbar";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import type { Group } from "../types";

describe("AboutDialog Component", () => {
    it("renders dialog content with developer credits, support info, and version typography pin when open", () => {
        render(<AboutDialog open={true} onClose={vi.fn()} />);

        // Verify title
        expect(screen.getByRole("heading", { name: /About & Support/i })).toBeInTheDocument();

        // Verify developer credits and NOC Tacti support info
        expect(screen.getByText("Daniel Reifer")).toBeInTheDocument();
        expect(screen.getByText("0305-4851")).toBeInTheDocument();

        // Verify dynamic version pin at the bottom (e.g. v1.0.0 or v{version})
        const versionPin = screen.getByText(/^v\d+\.\d+\.\d+/);
        expect(versionPin).toBeInTheDocument();
        expect(versionPin.tagName.toLowerCase()).toBe("p");
    });

    it("does not render dialog content when open is false", () => {
        render(<AboutDialog open={false} onClose={vi.fn()} />);
        expect(screen.queryByText(/About & Support/i)).not.toBeInTheDocument();
        expect(screen.queryByText("Daniel Reifer")).not.toBeInTheDocument();
    });

    it("renders a Close button and triggers onClose callback when clicked", () => {
        const handleClose = vi.fn();
        render(<AboutDialog open={true} onClose={handleClose} />);

        const closeBtn = screen.getByRole("button", { name: /Close/i });
        expect(closeBtn).toBeInTheDocument();
        fireEvent.click(closeBtn);
        expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("triggers onClose callback when backdrop is clicked", () => {
        const handleClose = vi.fn();
        render(<AboutDialog open={true} onClose={handleClose} />);

        // MUI Dialog backdrop element
        const backdrop = document.querySelector(".MuiBackdrop-root");
        expect(backdrop).toBeInTheDocument();

        if (backdrop) {
            fireEvent.click(backdrop);
            expect(handleClose).toHaveBeenCalledTimes(1);
        }
    });

    it("triggers onClose callback when escape key is pressed", () => {
        const handleClose = vi.fn();
        render(<AboutDialog open={true} onClose={handleClose} />);

        const dialog = screen.getByRole("dialog");
        fireEvent.keyDown(dialog, { key: "Escape", code: "Escape", keyCode: 27, charCode: 27 });
        expect(handleClose).toHaveBeenCalledTimes(1);
    });
});

describe("Navbar About Dialog Integration", () => {
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

    it("opens AboutDialog from the standalone navbar icon button trigger", async () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );

        // Click the standalone About & Support button in the navbar toolbar
        const aboutButton = screen.getByRole("button", { name: "About & Support" });
        expect(aboutButton).toBeInTheDocument();
        fireEvent.click(aboutButton);

        // AboutDialog should now be open
        expect(screen.getByRole("heading", { name: /About & Support/i })).toBeInTheDocument();
        expect(screen.getByText(/^v\d+\.\d+\.\d+/)).toBeInTheDocument();
    });

    it("does not render About & Support in the account menu to avoid duplicate links", async () => {
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

        // About & Support should NOT be in the account menu
        expect(
            within(accountMenu).queryByRole("menuitem", { name: /About & Support/i }),
        ).not.toBeInTheDocument();
    });

    it("does not render About & Support in the mobile menu to avoid duplicate links with navbar icon", async () => {
        render(
            <MemoryRouter>
                <Navbar />
            </MemoryRouter>,
        );

        // Open mobile hamburger menu
        const mobileMenuButton = screen.getByLabelText("Open navigation menu");
        fireEvent.click(mobileMenuButton);

        // Verify mobile menu items
        const mobileMenu = document.getElementById("mobile-menu");
        expect(mobileMenu).toBeInTheDocument();
        if (mobileMenu) {
            expect(within(mobileMenu).queryByText(/About & Support/i)).not.toBeInTheDocument();
        }
    });
});
