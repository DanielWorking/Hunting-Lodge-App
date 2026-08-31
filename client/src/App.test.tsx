import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "./App";
import * as UserContextModule from "./context/UserContext";
import * as DataContextModule from "./context/DataContext";
import * as NotificationContextModule from "./context/NotificationContext";
import type { Group } from "./types";

const LocationDisplay = () => {
    const location = useLocation();
    return <div data-testid="location-display">{location.pathname}</div>;
};

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
    const mockSampleGroup: Group = {
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
            groups: [mockSampleGroup],
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
                currentGroup: mockSampleGroup,
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
                currentGroup: mockSampleGroup,
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

        it("renders full user directory and groups table for regular admin users belonging to ADMINISTRATORS group", () => {
            const adminGroup: Group = {
                _id: "admin-group-id",
                name: "ADMINISTRATORS",
                members: ["reg-admin-id"],
                createdAt: new Date().toISOString(),
                settings: { shiftTypes: [], timeSlots: [] },
            };

            const sampleUsers = [
                {
                    _id: "u1",
                    username: "reg_admin",
                    displayName: "Regular Admin",
                    isActive: true,
                    vacationBalance: 18,
                    groups: [{ groupId: "admin-group-id", role: "member" as const }],
                },
                {
                    _id: "u2",
                    username: "inactive_emp",
                    displayName: "Inactive Employee",
                    isActive: false,
                    vacationBalance: 0,
                    groups: [{ groupId: "group-1", role: "member" as const }],
                },
            ];

            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: sampleUsers[0],
                currentGroup: adminGroup,
                setCurrentGroup: vi.fn(),
                isAdmin: true,
                isShiftManager: false,
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
                users: sampleUsers,
                setUsers: vi.fn(),
                groups: [adminGroup, mockSampleGroup],
                setGroups: vi.fn(),
                loading: false,
                refreshData: vi.fn(),
            });

            render(
                <MemoryRouter initialEntries={["/admin/users"]}>
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
            expect(screen.getByText("Regular Admin")).toBeInTheDocument();
            expect(screen.getByText("Inactive Employee")).toBeInTheDocument();
            expect(screen.getByText("Inactive")).toBeInTheDocument();
        });

        it("renders loading indicator and does not redirect to '/' while data context is loading during session restoration", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "admin-1",
                    username: "admin_user",
                    displayName: "Admin User",
                    isActive: true,
                    vacationBalance: 15,
                    groups: [{ groupId: "admin-group-id", role: "shift_manager" }],
                },
                currentGroup: null, // Pending group resolution from DataContext
                setCurrentGroup: vi.fn(),
                isAdmin: false, // Evaluates to false while currentGroup is null
                isShiftManager: false,
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
                groups: [],
                setGroups: vi.fn(),
                loading: true, // DataContext is actively fetching groups
                refreshData: vi.fn(),
            });

            render(
                <MemoryRouter initialEntries={["/admin/users"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            // Must NOT redirect to '/' (Sites page) or render Admin dashboard while loading
            expect(screen.getByTestId("location-display")).toHaveTextContent("/admin/users");
            expect(screen.queryByRole("button", { name: "All Tags" })).not.toBeInTheDocument();
            expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();

            // Must render the fallback loading component
            expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
            expect(screen.getByText("Thinking...")).toBeInTheDocument();
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
                currentGroup: mockSampleGroup,
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
                currentGroup: mockSampleGroup,
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

        it("renders loading indicator and does not redirect to '/' while data context is loading", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-mgr-1",
                    username: "manager_user",
                    displayName: "Shift Manager",
                    isActive: true,
                    vacationBalance: 15,
                    groups: [{ groupId: "group-1", role: "shift_manager" }],
                },
                currentGroup: null,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
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
                groups: [],
                setGroups: vi.fn(),
                loading: true,
                refreshData: vi.fn(),
            });

            render(
                <MemoryRouter initialEntries={["/group-settings"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            // Must NOT redirect to '/' (Sites page) or render group settings while loading
            expect(screen.getByTestId("location-display")).toHaveTextContent("/group-settings");
            expect(screen.queryByRole("button", { name: "All Tags" })).not.toBeInTheDocument();
            expect(screen.queryByText("Test Group Settings")).not.toBeInTheDocument();

            // Must render the fallback loading component
            expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
            expect(screen.getByText("Thinking...")).toBeInTheDocument();
        });
    });

    describe("ProtectedRoute Route Protection", () => {
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
                <MemoryRouter initialEntries={["/phones"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("location-display")).toHaveTextContent("/login");
            expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
        });

        it("renders loading indicator and stays on protected route while loading", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-1",
                    username: "member_user",
                    displayName: "Member User",
                    isActive: true,
                    vacationBalance: 10,
                    groups: [{ groupId: "group-1", role: "member" }],
                },
                currentGroup: null,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
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
                groups: [],
                setGroups: vi.fn(),
                loading: true,
                refreshData: vi.fn(),
            });

            render(
                <MemoryRouter initialEntries={["/phones"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("location-display")).toHaveTextContent("/phones");
            expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
            expect(screen.getByText("Thinking...")).toBeInTheDocument();
        });

        it("redirects authenticated users with no groups to '/guest'", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "guest-user",
                    username: "guest_user",
                    displayName: "Guest User",
                    isActive: true,
                    vacationBalance: 0,
                    groups: [],
                },
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
                <MemoryRouter initialEntries={["/phones"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("location-display")).toHaveTextContent("/guest");
        });
    });

    describe("/guest Route Protection", () => {
        it("renders loading indicator while restoring session without redirecting", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: null,
                currentGroup: null,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: true,
            });

            render(
                <MemoryRouter initialEntries={["/guest"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("location-display")).toHaveTextContent("/guest");
            expect(screen.getByRole("status", { name: "Loading..." })).toBeInTheDocument();
            expect(screen.getByText("Thinking...")).toBeInTheDocument();
        });

        it("redirects users with groups from '/guest' to '/'", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-1",
                    username: "member_user",
                    displayName: "Member User",
                    isActive: true,
                    vacationBalance: 10,
                    groups: [{ groupId: "group-1", role: "member" }],
                },
                currentGroup: mockSampleGroup,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/guest"]}>
                    <LocationDisplay />
                    <App />
                </MemoryRouter>,
            );

            expect(screen.getByTestId("location-display")).toHaveTextContent("/");
        });
    });

    describe("Accessibility Landmarks & Semantic Outlines", () => {
        it("renders the primary <main> landmark encapsulating dynamic page routes", () => {
            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: {
                    _id: "user-1",
                    username: "member_user",
                    displayName: "Member User",
                    isActive: true,
                    vacationBalance: 10,
                    groups: [{ groupId: "group-1", role: "member" }],
                },
                currentGroup: mockSampleGroup,
                setCurrentGroup: vi.fn(),
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            render(
                <MemoryRouter initialEntries={["/"]}>
                    <App />
                </MemoryRouter>,
            );

            // Verify <main> landmark exists in the accessibility tree
            const mainLandmark = screen.getByRole("main");
            expect(mainLandmark).toBeInTheDocument();
            expect(mainLandmark).toHaveAttribute("id", "main-content");
        });
    });
});
