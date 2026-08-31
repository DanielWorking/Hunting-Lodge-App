import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ThinkingLoader from "./components/ThinkingLoader";
import AboutDialog from "./components/AboutDialog";
import ShiftDatesDialog from "./components/ShiftDatesDialog";
import PhoneDetailsDialog from "./components/PhoneDetailsDialog";
import ShiftReportPage from "./pages/ShiftReportPage";
import SitesPage from "./pages/SitesPage";
import GroupSettingsPage from "./pages/GroupSettingsPage";
import NotFoundPage from "./pages/NotFoundPage";
import LoginPage from "./pages/LoginPage";
import GuestPage from "./pages/GuestPage";
import AdminPage from "./pages/AdminPage";
import * as UserContextModule from "./context/UserContext";
import * as DataContextModule from "./context/DataContext";
import * as NotificationContextModule from "./context/NotificationContext";
import type { Group, PhoneRow, ShiftType, TimeSlot, SiteCard } from "./types";

// Mock external dependencies and APIs
vi.mock("./api/reportsApi", () => ({
    getReports: vi.fn().mockResolvedValue({
        data: [
            {
                _id: "report-1",
                title: "Morning Shift Report",
                startTime: new Date("2026-08-31T08:00:00Z").toISOString(),
                endTime: new Date("2026-08-31T16:00:00Z").toISOString(),
                attendees: [],
                previousTasks: "<p>Previous tasks log</p>",
                currentTasks: "<p>Current tasks log</p>",
                isLocked: false,
            },
        ],
    }),
    createReport: vi.fn(),
    updateReport: vi.fn(),
    deleteReport: vi.fn(),
}));

vi.mock("./api/usersApi", () => ({
    getUsers: vi.fn().mockResolvedValue({ data: [] }),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
}));

vi.mock("./api/groupsApi", () => ({
    getGroups: vi.fn().mockResolvedValue({ data: [] }),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
}));

vi.mock("./api/sitesApi", () => ({
    getSites: vi.fn().mockResolvedValue({ data: [] }),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
}));

vi.mock("./api/phonesApi", () => ({
    getPhones: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("./api/schedulesApi", () => ({
    getSchedules: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@tiptap/react", () => ({
    useEditor: () => null,
    EditorContent: () => <div data-testid="mock-tiptap-editor" />,
}));

describe("Heading Hierarchy & Accessibility Compliance (WCAG 2.2 SC 2.4.10 / Section 508)", () => {
    const mockShiftType: ShiftType = {
        _id: "st-1",
        name: "Morning Shift",
        color: "#4caf50",
        isVacation: false,
    };

    const mockTimeSlot: TimeSlot = {
        _id: "slot-1",
        name: "Morning",
        startTime: "08:00",
        endTime: "16:00",
        linkedShiftTypes: ["st-1"],
    };

    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["HQ", "Field"],
        settings: {
            shiftTypes: [mockShiftType],
            timeSlots: [mockTimeSlot],
        },
    };

    const mockUser = {
        _id: "user-1",
        username: "danie",
        displayName: "Daniel Reifer",
        isActive: true,
        vacationBalance: 12,
        groups: [{ groupId: "group-1", role: "shift_manager" as const }],
    };

    const mockSite: SiteCard = {
        _id: "site-1",
        title: "Portal Alpha",
        url: "https://portal.alpha",
        description: "Operational portal",
        tag: "HQ",
        groupId: "group-1",
        createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: vi.fn(),
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [mockSite],
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
            isAdmin: true,
            isShiftManager: true,
            login: vi.fn(),
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });
    });

    /**
     * Helper to extract the list of heading levels in DOM order.
     */
    const getHeadingLevelsInDomOrder = (): number[] => {
        const headings = screen.queryAllByRole("heading");
        return headings.map((h) => {
            const ariaLevel = h.getAttribute("aria-level");
            if (ariaLevel) return parseInt(ariaLevel, 10);
            const tagName = h.tagName.toLowerCase();
            const match = tagName.match(/^h([1-6])$/);
            return match ? parseInt(match[1], 10) : 0;
        });
    };

    describe("Utility and Dialog Components (Semantic Non-Heading Elements)", () => {
        it("ThinkingLoader does NOT render heading elements into the DOM", () => {
            render(<ThinkingLoader showText={true} />);

            expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
            expect(screen.getByText("Thinking...")).toBeInTheDocument();

            // Must NOT render any <h1> to <h6> tags
            expect(screen.queryAllByRole("heading")).toHaveLength(0);
            expect(screen.getByText("Thinking...").tagName.toLowerCase()).toBe("p");
        });

        it("AboutDialog renders DialogTitle as h2 and developer credits / phone numbers as non-headings (<p>)", () => {
            render(<AboutDialog open={true} onClose={vi.fn()} />);

            const headings = screen.getAllByRole("heading");
            expect(headings).toHaveLength(1);
            expect(headings[0]).toHaveTextContent("About & Support");
            expect(headings[0].tagName.toLowerCase()).toBe("h2");

            // Verify developer credit and contact extension are paragraph elements, not <h5> or <h6>
            const nameElement = screen.getByText("Daniel Reifer");
            expect(nameElement.tagName.toLowerCase()).toBe("p");

            const phoneElement = screen.getByText("0305-4851");
            expect(phoneElement.tagName.toLowerCase()).toBe("p");
        });

        it("ShiftDatesDialog renders DialogTitle without nesting invalid <h6> heading inside <h2>", () => {
            render(
                <ShiftDatesDialog
                    open={true}
                    onClose={vi.fn()}
                    shiftName="Night Shift"
                    dates={[]}
                />,
            );

            const headings = screen.getAllByRole("heading");
            expect(headings).toHaveLength(1);
            expect(headings[0]).toHaveTextContent("Night Shift");
            expect(headings[0].tagName.toLowerCase()).toBe("h2");

            const shiftNameText = screen.getByText("Night Shift");
            expect(shiftNameText.tagName.toLowerCase()).toBe("span");
        });

        it("PhoneDetailsDialog renders DialogTitle as h2 and contact name / numbers as paragraph elements", () => {
            const mockPhone: PhoneRow = {
                _id: "phone-1",
                name: "Duty Officer",
                type: "Landline",
                numbers: ["101", "102"],
                description: "24/7 Desk",
                isFavorite: false,
            };

            render(
                <PhoneDetailsDialog
                    open={true}
                    onClose={vi.fn()}
                    data={mockPhone}
                />,
            );

            const headings = screen.getAllByRole("heading");
            expect(headings).toHaveLength(1);
            expect(headings[0]).toHaveTextContent("Phone Details");
            expect(headings[0].tagName.toLowerCase()).toBe("h2");

            const contactName = screen.getByText("Duty Officer");
            expect(contactName.tagName.toLowerCase()).toBe("p");

            const num1 = screen.getByText("101");
            const num2 = screen.getByText("102");
            expect(num1.tagName.toLowerCase()).toBe("p");
            expect(num2.tagName.toLowerCase()).toBe("p");
        });
    });

    describe("Page Views - Strict Descending Heading Hierarchy", () => {
        it("ShiftReportPage contains a sequentially descending heading tree: h1 -> h2 -> h3", async () => {
            render(
                <MemoryRouter>
                    <ShiftReportPage />
                </MemoryRouter>,
            );

            // Wait for reports to load and render
            expect(await screen.findByText("Shift Reports")).toBeInTheDocument();

            const headingLevels = getHeadingLevelsInDomOrder();
            // Expected:
            // 1. h1: Shift Reports
            // 2. h2: Reports Archive
            // 3. h2: Morning Shift Report (or Select a report)
            // 4. h3: Tasks from previous shift
            // 5. h3: Shift Attendance
            // 6. h3: Operations Log / Ongoing Tasks
            expect(headingLevels[0]).toBe(1);
            expect(headingLevels).toEqual([1, 2, 2, 3, 3, 3]);

            // Verify sequential descent (no level skips e.g. 1 -> 3 or 2 -> 4)
            for (let i = 1; i < headingLevels.length; i++) {
                const diff = headingLevels[i] - headingLevels[i - 1];
                expect(diff).toBeLessThanOrEqual(1);
            }
        });

        it("SitesPage contains a valid sequential heading tree: h1 -> h2 -> h3", () => {
            render(
                <MemoryRouter>
                    <SitesPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            // Expected:
            // 1. h1: Command Center Sites
            // 2. h2: Portal Alpha (card front)
            // 3. h3: About Portal Alpha (card back)
            expect(headingLevels).toEqual([1, 2, 3]);
        });

        it("GroupSettingsPage contains a valid sequential heading tree: h1 -> h2", () => {
            render(
                <MemoryRouter>
                    <GroupSettingsPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            // Expected:
            // 1. h1: Command Center Settings
            // 2. h2: Manage Shift Types (active tab)
            expect(headingLevels).toEqual([1, 2]);
        });

        it("NotFoundPage contains a valid sequential heading tree: h1 -> h2", () => {
            render(
                <MemoryRouter>
                    <NotFoundPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            // Expected:
            // 1. h1: 404
            // 2. h2: Page Not Found
            expect(headingLevels).toEqual([1, 2]);
        });

        it("LoginPage contains a single h1 heading", () => {
            render(
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            expect(headingLevels).toEqual([1]);
            expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hunting Lodge");
        });

        it("GuestPage contains a single h1 heading", () => {
            render(
                <MemoryRouter>
                    <GuestPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            expect(headingLevels).toEqual([1]);
            expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome, danie");
        });

        it("AdminPage contains a single h1 heading", () => {
            render(
                <MemoryRouter>
                    <AdminPage />
                </MemoryRouter>,
            );

            const headingLevels = getHeadingLevelsInDomOrder();
            expect(headingLevels).toEqual([1]);
            expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Admin Dashboard");
        });
    });
});
