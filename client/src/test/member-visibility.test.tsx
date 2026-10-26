import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosResponse } from "axios";
import { DataProvider, useData } from "../context/DataContext";
import { UserProvider, useUser } from "../context/UserContext";
import * as sitesApi from "../api/sitesApi";
import * as phonesApi from "../api/phonesApi";
import * as groupsApi from "../api/groupsApi";
import * as usersApi from "../api/usersApi";
import * as authApi from "../api/authApi";
import type { Group, User, SiteCard, PhoneRow } from "../types";

vi.mock("../api/sitesApi", () => ({
    getSites: vi.fn(),
}));

vi.mock("../api/phonesApi", () => ({
    getPhones: vi.fn(),
}));

vi.mock("../api/groupsApi", () => ({
    getGroups: vi.fn(),
}));

vi.mock("../api/usersApi", () => ({
    getUsers: vi.fn(),
}));

vi.mock("../api/authApi", () => ({
    getMe: vi.fn(),
}));

const mockAxiosRes = <T,>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} as AxiosResponse["config"]["headers"] },
});

describe("Client Member Visibility & Session Restoration Regression Suite", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("populates users and active group for regular non-admin members during session restoration", async () => {
        localStorage.setItem("hunting_userId", "member-1");
        localStorage.setItem("hunting_groupId", "noc-group-id");

        const nocGroup: Group = {
            _id: "noc-group-id",
            name: "noc",
            members: ["member-1", "member-2"],
            createdAt: new Date().toISOString(),
        };

        const mockNocMember = {
            _id: "member-1",
            username: "noc_regular",
            displayName: "NOC Regular Member",
            isActive: true,
            vacationBalance: 12,
            groups: [{ groupId: "noc-group-id", role: "member" as const }],
        };

        const mockNocPeer: User = {
            _id: "member-2",
            username: "noc_peer",
            displayName: "NOC Peer Member",
            isActive: true,
            vacationBalance: 8,
            groups: [{ groupId: "noc-group-id", role: "member" }],
        };

        // getMe resolves with a slight delay simulating real network request
        vi.mocked(authApi.getMe).mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(mockAxiosRes(mockNocMember));
                    }, 25);
                }),
        );

        vi.mocked(sitesApi.getSites).mockResolvedValue(mockAxiosRes<SiteCard[]>([]));
        vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
        vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([nocGroup]));
        vi.mocked(usersApi.getUsers).mockImplementation(async (groupId?: string) => {
            if (groupId === "noc-group-id") {
                return mockAxiosRes<User[]>([mockNocMember as User, mockNocPeer]);
            }
            return mockAxiosRes<User[]>([]);
        });

        const TestConsumer = () => {
            const { user, currentGroup, isRestoringSession } = useUser();
            const { users, loading } = useData();

            if (isRestoringSession) {
                return <div data-testid="status">restoring</div>;
            }

            return (
                <div>
                    <div data-testid="status">ready</div>
                    <div data-testid="current-user">{user?.username}</div>
                    <div data-testid="current-group">{currentGroup?.name}</div>
                    <div data-testid="data-loading">{loading ? "loading" : "idle"}</div>
                    <div data-testid="users-count">{users.length}</div>
                    <ul>
                        {users.map((u) => (
                            <li key={u._id} data-testid={`user-${u.username}`}>
                                {u.displayName || u.username}
                            </li>
                        ))}
                    </ul>
                </div>
            );
        };

        render(
            <UserProvider>
                <DataProvider>
                    <TestConsumer />
                </DataProvider>
            </UserProvider>,
        );

        // Wait for session to restore and users to be populated
        await waitFor(
            () => {
                expect(screen.getByTestId("status").textContent).toBe("ready");
                expect(screen.getByTestId("users-count").textContent).toBe("2");
            },
            { timeout: 3000 },
        );

        expect(screen.getByTestId("user-noc_regular")).toBeInTheDocument();
        expect(screen.getByTestId("user-noc_peer")).toBeInTheDocument();
        expect(screen.getByTestId("current-group").textContent).toBe("noc");
    });

    it("populates users and active group for group managers during session restoration", async () => {
        localStorage.setItem("hunting_userId", "manager-1");
        localStorage.setItem("hunting_groupId", "noc-group-id");

        const nocGroup: Group = {
            _id: "noc-group-id",
            name: "noc",
            members: ["manager-1"],
            createdAt: new Date().toISOString(),
        };

        const mockManager = {
            _id: "manager-1",
            username: "noc_manager",
            displayName: "NOC Group Manager",
            isActive: true,
            vacationBalance: 15,
            groups: [{ groupId: "noc-group-id", role: "shift_manager" as const }],
        };

        vi.mocked(authApi.getMe).mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(mockAxiosRes(mockManager));
                    }, 25);
                }),
        );

        vi.mocked(sitesApi.getSites).mockResolvedValue(mockAxiosRes<SiteCard[]>([]));
        vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
        vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([nocGroup]));
        vi.mocked(usersApi.getUsers).mockImplementation(async (groupId?: string) => {
            if (groupId === "noc-group-id") {
                return mockAxiosRes<User[]>([mockManager as User]);
            }
            return mockAxiosRes<User[]>([]);
        });

        const TestConsumer = () => {
            const { currentGroup, isRestoringSession, isShiftManager } = useUser();
            const { users } = useData();

            if (isRestoringSession) return <div>restoring</div>;

            return (
                <div>
                    <div data-testid="is-shift-manager">{isShiftManager ? "yes" : "no"}</div>
                    <div data-testid="current-group">{currentGroup?.name}</div>
                    <div data-testid="users-count">{users.length}</div>
                    {users.map((u) => (
                        <div key={u._id} data-testid="user-entry">{u.displayName}</div>
                    ))}
                </div>
            );
        };

        render(
            <UserProvider>
                <DataProvider>
                    <TestConsumer />
                </DataProvider>
            </UserProvider>,
        );

        await waitFor(
            () => {
                expect(screen.getByTestId("users-count").textContent).toBe("1");
            },
            { timeout: 3000 },
        );

        expect(screen.getByTestId("user-entry").textContent).toBe("NOC Group Manager");
        expect(screen.getByTestId("current-group").textContent).toBe("noc");
    });

    it("populates users for regular member even when hunting_groupId is not preset in localStorage", async () => {
        localStorage.setItem("hunting_userId", "member-1");
        // NOTE: hunting_groupId is NOT in localStorage!

        const nocGroup: Group = {
            _id: "noc-group-id",
            name: "noc",
            members: ["member-1"],
            createdAt: new Date().toISOString(),
        };

        const mockNocMember = {
            _id: "member-1",
            username: "noc_regular",
            displayName: "NOC Regular Member",
            isActive: true,
            vacationBalance: 12,
            groups: [{ groupId: "noc-group-id", role: "member" as const }],
        };

        vi.mocked(authApi.getMe).mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(mockAxiosRes(mockNocMember));
                    }, 40);
                }),
        );

        vi.mocked(sitesApi.getSites).mockImplementation(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(mockAxiosRes<SiteCard[]>([]));
                    }, 100);
                }),
        );
        vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
        vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([nocGroup]));
        vi.mocked(usersApi.getUsers).mockImplementation(async (groupId?: string) => {
            if (groupId === "noc-group-id") {
                return mockAxiosRes<User[]>([mockNocMember as User]);
            }
            return mockAxiosRes<User[]>([]);
        });

        const TestConsumer = () => {
            const { currentGroup, isRestoringSession } = useUser();
            const { users } = useData();

            if (isRestoringSession) return <div>restoring</div>;

            return (
                <div>
                    <div data-testid="current-group">{currentGroup?.name}</div>
                    <div data-testid="users-count">{users.length}</div>
                    {users.map((u) => (
                        <div key={u._id} data-testid="user-entry">{u.displayName}</div>
                    ))}
                </div>
            );
        };

        render(
            <UserProvider>
                <DataProvider>
                    <TestConsumer />
                </DataProvider>
            </UserProvider>,
        );

        await waitFor(
            () => {
                expect(screen.getByTestId("users-count").textContent).toBe("1");
            },
            { timeout: 3000 },
        );

        expect(screen.getByTestId("user-entry").textContent).toBe("NOC Regular Member");
        expect(screen.getByTestId("current-group").textContent).toBe("noc");
    });

    it("ignores a membership whose group no longer exists instead of requesting users of group \"null\"", async () => {
        localStorage.setItem("hunting_userId", "admin-1");
        // What the login stored: the id of the administrators group as it was before being recreated
        localStorage.setItem("hunting_groupId", "deleted-admin-group-id");

        const adminGroup: Group = {
            _id: "admin-group-id",
            name: "admin",
            members: ["admin-1"],
            isSystemGroup: true,
            createdAt: new Date().toISOString(),
        };

        // A deleted group's membership populates as null, listed before the live one (the raw server
        // shape, which normalizeUser turns into a User)
        vi.mocked(authApi.getMe).mockResolvedValue(
            mockAxiosRes({
                _id: "admin-1",
                username: "super",
                isActive: true,
                isSuperAdmin: true,
                isAdmin: true,
                groups: [
                    { groupId: null, role: "shift_manager", order: 0, isSystemGroup: false },
                    { groupId: { _id: "admin-group-id", name: "admin" }, role: "shift_manager", order: 1, isSystemGroup: true },
                ],
            }) as never,
        );
        vi.mocked(sitesApi.getSites).mockResolvedValue(mockAxiosRes<SiteCard[]>([]));
        vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
        vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([adminGroup]));
        vi.mocked(usersApi.getUsers).mockResolvedValue(mockAxiosRes<User[]>([]));

        const TestConsumer = () => {
            const { user, currentGroup, isAdmin, isRestoringSession } = useUser();
            const { loadError, loading } = useData();

            if (isRestoringSession || loading) return <div>restoring</div>;

            return (
                <div>
                    <div data-testid="memberships">{user?.groups.map((g) => g.groupId).join(",")}</div>
                    <div data-testid="current-group">{currentGroup?.name}</div>
                    <div data-testid="is-admin">{isAdmin ? "yes" : "no"}</div>
                    <div data-testid="load-error">{loadError ? loadError.message : "none"}</div>
                </div>
            );
        };

        render(
            <UserProvider>
                <DataProvider>
                    <TestConsumer />
                </DataProvider>
            </UserProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("current-group").textContent).toBe("admin"), { timeout: 3000 });

        expect(screen.getByTestId("memberships").textContent).toBe("admin-group-id");
        expect(screen.getByTestId("is-admin").textContent).toBe("yes");
        expect(screen.getByTestId("load-error").textContent).toBe("none");
        expect(usersApi.getUsers).not.toHaveBeenCalledWith("null");
        // An administrator loads the whole directory
        expect(usersApi.getUsers).toHaveBeenCalledWith();
    });
});
