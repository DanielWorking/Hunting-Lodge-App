import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { AxiosResponse } from "axios";
import apiClient, { clearInFlightRequests } from "../api/apiClient";
import Navbar from "../components/Navbar";
import { DataProvider, useData } from "../context/DataContext";
import * as UserContextModule from "../context/UserContext";
import * as sitesApi from "../api/sitesApi";
import * as phonesApi from "../api/phonesApi";
import * as groupsApi from "../api/groupsApi";
import * as usersApi from "../api/usersApi";
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

const mockAxiosRes = <T,>(data: T): AxiosResponse<T> => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} as AxiosResponse["config"]["headers"] },
});

describe("Performance Optimization & Deduplication Suite", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearInFlightRequests();
        localStorage.clear();
        vi.mocked(sitesApi.getSites).mockResolvedValue(mockAxiosRes<SiteCard[]>([]));
        vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
        vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([]));
        vi.mocked(usersApi.getUsers).mockResolvedValue(mockAxiosRes<User[]>([]));
    });

    describe("Image Delivery & Responsive Navbar Logo", () => {
        it("renders the hunting lodge logo with 50x50 dimensions and responsive srcset attributes", () => {
            const mockUser: User = {
                _id: "user-1",
                username: "testuser",
                displayName: "Test User",
                isActive: true,
                vacationBalance: 10,
                groups: [{ groupId: "group-1", role: "member" }],
            };

            const mockGroup: Group = {
                _id: "group-1",
                name: "Alpha Team",
                members: ["user-1"],
                createdAt: new Date().toISOString(),
            };

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

            render(
                <MemoryRouter>
                    <DataProvider>
                        <Navbar />
                    </DataProvider>
                </MemoryRouter>,
            );

            const logo = screen.getByRole("img", { name: /Logo/i });
            expect(logo).toBeInTheDocument();
            expect(logo).toHaveAttribute("src", "/hunting-lodge-image-50.jpg");
            expect(logo).toHaveAttribute("srcset");
            expect(logo.getAttribute("srcset")).toContain("/hunting-lodge-image-50.jpg 1x");
            expect(logo.getAttribute("srcset")).toContain("/hunting-lodge-image-100.jpg 2x");
            expect(logo).toHaveAttribute("sizes", "50px");
        });
    });

    describe("In-Flight API Request Deduplication", () => {
        it("deduplicates concurrent duplicate GET requests to the same endpoint into a single network call", async () => {
            const spyGet = vi.spyOn(apiClient, "get");

            // Dispatch 3 concurrent calls to the same endpoint
            const req1 = apiClient.get("/test-endpoint");
            const req2 = apiClient.get("/test-endpoint");
            const req3 = apiClient.get("/test-endpoint");

            expect(req1).toBe(req2);
            expect(req2).toBe(req3);

            spyGet.mockRestore();
        });
    });

    describe("DataContext Single-Flight Data Synchronization", () => {
        it("fetches sites, phones, groups, and users exactly once on initial load without duplicate re-fetches", async () => {
            localStorage.setItem("hunting_token", "test-token");
            localStorage.setItem("hunting_userId", "user-1");

            const mockUser: User = {
                _id: "user-1",
                username: "testuser",
                displayName: "Test User",
                isActive: true,
                vacationBalance: 10,
                groups: [{ groupId: "group-1", role: "member" }],
            };

            const mockGroup: Group = {
                _id: "group-1",
                name: "Alpha Team",
                members: ["user-1"],
                createdAt: new Date().toISOString(),
            };

            const setCurrentGroupMock = vi.fn();

            vi.spyOn(UserContextModule, "useUser").mockReturnValue({
                user: mockUser,
                currentGroup: null,
                setCurrentGroup: setCurrentGroupMock,
                isAdmin: false,
                isShiftManager: false,
                login: vi.fn(),
                logout: vi.fn(),
                switchGroup: vi.fn(),
                isRestoringSession: false,
            });

            vi.mocked(sitesApi.getSites).mockResolvedValue(mockAxiosRes<SiteCard[]>([]));
            vi.mocked(phonesApi.getPhones).mockResolvedValue(mockAxiosRes<PhoneRow[]>([]));
            vi.mocked(groupsApi.getGroups).mockResolvedValue(mockAxiosRes<Group[]>([mockGroup]));
            vi.mocked(usersApi.getUsers).mockResolvedValue(mockAxiosRes<User[]>([mockUser]));

            const TestConsumer = () => {
                const { loading, sites, phones, groups, users } = useData();
                if (loading) return <div>Loading...</div>;
                return (
                    <div>
                        <span>Sites: {sites.length}</span>
                        <span>Phones: {phones.length}</span>
                        <span>Groups: {groups.length}</span>
                        <span>Users: {users.length}</span>
                    </div>
                );
            };

            render(
                <DataProvider>
                    <TestConsumer />
                </DataProvider>,
            );

            await waitFor(() => {
                expect(screen.getByText("Sites: 0")).toBeInTheDocument();
            });

            expect(sitesApi.getSites).toHaveBeenCalledTimes(1);
            expect(phonesApi.getPhones).toHaveBeenCalledTimes(1);
            expect(groupsApi.getGroups).toHaveBeenCalledTimes(1);
            expect(usersApi.getUsers).toHaveBeenCalledTimes(1);
        });
    });
});
