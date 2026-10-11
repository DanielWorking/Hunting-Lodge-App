import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SitesPage from "../pages/SitesPage";
import * as UserContextModule from "../context/UserContext";
import * as DataContextModule from "../context/DataContext";
import * as NotificationContextModule from "../context/NotificationContext";
import * as sitesApi from "../api/sitesApi";
import type { Group, SiteCard } from "../types";

vi.mock("../api/sitesApi", () => ({
    getSites: vi.fn().mockResolvedValue({ data: [] }),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    toggleFavoriteSite: vi.fn(),
}));

vi.mock("../api/groupsApi", () => ({
    getGroups: vi.fn().mockResolvedValue({ data: [] }),
    addGroupTag: vi.fn(),
    renameGroupTag: vi.fn(),
    deleteGroupTag: vi.fn(),
}));

type SetSitesUpdater = (prev: SiteCard[]) => SiteCard[];

describe("SitesPage mutations update the list from the server response", () => {
    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["General"],
        settings: { shiftTypes: [], timeSlots: [] },
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
        tag: "General",
        groupId: "group-1",
        favoritedBy: [],
        createdAt: new Date().toISOString(),
    };

    const setSites = vi.fn();
    const refreshData = vi.fn();
    const showNotification = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification,
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [mockSite],
            setSites,
            phones: [],
            setPhones: vi.fn(),
            users: [mockUser],
            setUsers: vi.fn(),
            groups: [mockGroup],
            setGroups: vi.fn(),
            loading: false,
            refreshData,
        });

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user: mockUser,
            currentGroup: mockGroup,
            setCurrentGroup: vi.fn(),
            isAdmin: false,
            isShiftManager: true,
            login: vi.fn(),
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        });
    });

    const renderPage = () =>
        render(
            <MemoryRouter>
                <SitesPage />
            </MemoryRouter>,
        );

    const applyLastUpdater = (): SiteCard[] => {
        const updater = setSites.mock.calls.at(-1)?.[0] as SetSitesUpdater;
        expect(typeof updater).toBe("function");
        return updater([mockSite]);
    };

    it("edit applies the saved site from the server response instead of waiting for a refetch", async () => {
        vi.mocked(sitesApi.updateSite).mockResolvedValue({
            data: { ...mockSite, title: "Portal Renamed" },
        } as never);

        renderPage();
        fireEvent.click(screen.getByRole("button", { name: "Edit Portal Alpha" }));
        fireEvent.change(screen.getByRole("textbox", { name: /^site name/i }), {
            target: { value: "Portal Renamed" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() => expect(setSites).toHaveBeenCalled());
        expect(applyLastUpdater()[0].title).toBe("Portal Renamed");
    });

    it("edit does not change the list when the server rejects the save", async () => {
        vi.mocked(sitesApi.updateSite).mockRejectedValue(new Error("Validation failed"));

        renderPage();
        fireEvent.click(screen.getByRole("button", { name: "Edit Portal Alpha" }));
        fireEvent.change(screen.getByRole("textbox", { name: /^site name/i }), {
            target: { value: "Portal Renamed" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() =>
            expect(showNotification).toHaveBeenCalledWith("Error saving site", "error"),
        );
        expect(setSites).not.toHaveBeenCalled();
    });

    it("delete removes the site from the list once the server confirms it", async () => {
        vi.mocked(sitesApi.deleteSite).mockResolvedValue({
            data: { message: "Site deleted" },
        } as never);

        renderPage();
        fireEvent.click(screen.getByRole("button", { name: "Delete Portal Alpha" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

        await waitFor(() => expect(setSites).toHaveBeenCalled());
        expect(applyLastUpdater()).toEqual([]);
    });

    it("favorite applies the server's favoritedBy and ignores a second click while the first request is pending", async () => {
        let resolveToggle!: (value: unknown) => void;
        vi.mocked(sitesApi.toggleFavoriteSite).mockReturnValue(
            new Promise((resolve) => {
                resolveToggle = resolve;
            }) as never,
        );

        renderPage();
        const heart = screen.getByRole("button", { name: "Add Portal Alpha to favorites" });
        fireEvent.click(heart);
        fireEvent.click(heart);

        expect(sitesApi.toggleFavoriteSite).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveToggle({ data: { ...mockSite, favoritedBy: ["user-1"] } });
        });

        await waitFor(() => expect(setSites).toHaveBeenCalled());
        expect(applyLastUpdater()[0].favoritedBy).toEqual(["user-1"]);
    });
});
