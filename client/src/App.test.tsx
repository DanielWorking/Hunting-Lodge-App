import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import * as UserContextModule from "./context/UserContext";
import * as DataContextModule from "./context/DataContext";
import * as NotificationContextModule from "./context/NotificationContext";

// Mock API and dialog components to keep route rendering isolated and lightweight
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
}));

vi.mock("./api/phonesApi", () => ({
    getPhones: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("./api/schedulesApi", () => ({
    getSchedules: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("./api/reportsApi", () => ({
    getReports: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@tiptap/react", () => ({
    useEditor: () => null,
    EditorContent: () => <div data-testid="mock-tiptap-editor" />,
}));

describe("App Routing - Access Control & Secure Redirects", () => {
    const mockSampleGroup = {
        _id: "group-1",
        name: "Test Group",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        settings: {
            shiftTypes: [],
            timeSlots: [],
        },
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
            users: [],
            setUsers: vi.fn(),
            groups: [mockSampleGroup as any],
            setGroups: vi.fn(),
            loading: false,
            refreshData: vi.fn(),
        });
    });

    describe("/admin/users Route Protection", () => {
        it("redirects unauthorized users (isAdmin: false) to '/' and does not render admin elements or access denied messages", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-1",
                    username: "member_user",
                    displayName: "Member User",
                    isActive: true,
                    vacationBalance: 10,
                    groups: [{ groupId: "group-1", role: "member" }],
                },
                currentGroup: mockSampleGroup as any,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/admin/users"]}>
                    <App />
                </MemoryRouter>,
            );

            // Should redirect to '/' and render the home / Sites page
            expect(screen.getAllByText("Sites").length).toBeGreaterThan(0);
            expect(screen.getByRole("button", { name: "All Tags" })).toBeInTheDocument();

            // Must NOT render any admin dashboard elements or error messages
            expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
            expect(screen.queryByText(/Manage users and groups/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Access Denied/i)).not.toBeInTheDocument();
        });

        it("redirects unauthenticated users to '/login'", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: null,
                currentGroup: null,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/admin/users"]}>
                    <App />
                </MemoryRouter>,
            );

            // Should render login page elements
            expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
            expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
        });

        it("renders Admin Dashboard when user is an authorized admin (isAdmin: true)", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "admin-1",
                    username: "admin_user",
                    displayName: "Admin User",
                    isActive: true,
                    vacationBalance: 15,
                    groups: [{ groupId: "group-1", role: "shift_manager" }],
                },
                currentGroup: mockSampleGroup as any,
                setCurrentGroup: vi.fn(),
                isAdmin: true,
                isShiftManager: true,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/admin/users"]}>
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
            expect(screen.getByText("Manage users and groups.")).toBeInTheDocument();
        });
    });

    describe("/group-settings Route Protection", () => {
        it("redirects unauthorized users (isShiftManager: false) to '/' without rendering an Access Denied message", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-1",
                    username: "member_user",
                    displayName: "Member User",
                    isActive: true,
                    vacationBalance: 10,
                    groups: [{ groupId: "group-1", role: "member" }],
                },
                currentGroup: mockSampleGroup as any,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/group-settings"]}>
                    <App />
                </MemoryRouter>,
            );

            // Should redirect to '/' and render Sites page
            expect(screen.getAllByText("Sites").length).toBeGreaterThan(0);
            expect(screen.getByRole("button", { name: "All Tags" })).toBeInTheDocument();

            // Must NOT render Access Denied message or settings tabs
            expect(screen.queryByText(/Access Denied/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Test Group Settings/i)).not.toBeInTheDocument();
        });

        it("renders Group Settings when user is an authorized shift manager (isShiftManager: true)", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-mgr-1",
                    username: "manager_user",
                    displayName: "Shift Manager",
                    isActive: true,
                    vacationBalance: 15,
                    groups: [{ groupId: "group-1", role: "shift_manager" }],
                },
                currentGroup: mockSampleGroup as any,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: true,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/group-settings"]}>
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByText("Test Group Settings")).toBeInTheDocument();
        });
    });
});
