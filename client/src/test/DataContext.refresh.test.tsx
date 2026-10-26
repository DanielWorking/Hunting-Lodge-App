import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataProvider, useData } from "../context/DataContext";
import * as UserContextModule from "../context/UserContext";
import * as sitesApi from "../api/sitesApi";
import * as phonesApi from "../api/phonesApi";
import * as groupsApi from "../api/groupsApi";
import * as usersApi from "../api/usersApi";
import type { SiteCard } from "../types";

vi.mock("../api/sitesApi", () => ({ getSites: vi.fn() }));
vi.mock("../api/phonesApi", () => ({ getPhones: vi.fn() }));
vi.mock("../api/groupsApi", () => ({ getGroups: vi.fn() }));
vi.mock("../api/usersApi", () => ({ getUsers: vi.fn() }));

const site = (title: string): SiteCard =>
    ({
        _id: `id-${title}`,
        title,
        url: "https://example.test",
        description: "",
        tag: "General",
        groupId: "mine",
        favoritedBy: [],
        createdAt: new Date().toISOString(),
    }) as SiteCard;

function Probe() {
    const { sites, loading, refreshData } = useData();
    return (
        <div>
            <p data-testid="sites">{sites.map((s) => s.title).join(",")}</p>
            <p data-testid="loading">{String(loading)}</p>
            <button onClick={() => refreshData()}>refresh</button>
        </div>
    );
}

const user = {
    _id: "user-1",
    username: "danie",
    isActive: true,
    vacationBalance: 0,
    groups: [{ groupId: "mine", role: "member" }],
};

describe("DataProvider refresh behaviour", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();

        vi.mocked(sitesApi.getSites).mockResolvedValue({ data: [site("Alpha")] } as never);
        vi.mocked(phonesApi.getPhones).mockResolvedValue({ data: [] } as never);
        vi.mocked(groupsApi.getGroups).mockResolvedValue({
            data: [{ _id: "mine", name: "Mine", members: [], createdAt: "" }],
        } as never);
        vi.mocked(usersApi.getUsers).mockResolvedValue({ data: [] } as never);

        vi.spyOn(UserContextModule, "useUser").mockReturnValue({
            user,
            currentGroup: null,
            setCurrentGroup: vi.fn(),
            isAdmin: false,
            isShiftManager: false,
            logout: vi.fn(),
            switchGroup: vi.fn(),
            isRestoringSession: false,
        } as never);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it("keeps the sites list when another request in the same load fails", async () => {
        vi.mocked(usersApi.getUsers).mockRejectedValue(
            Object.assign(new Error("Forbidden"), { response: { status: 403 } }),
        );

        render(
            <DataProvider>
                <Probe />
            </DataProvider>,
        );

        await waitFor(() => expect(screen.getByTestId("sites")).toHaveTextContent("Alpha"));
    });

    it("a background refresh does not raise the global loading flag", async () => {
        render(
            <DataProvider>
                <Probe />
            </DataProvider>,
        );
        await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

        let resolveRefresh!: (value: unknown) => void;
        vi.mocked(sitesApi.getSites).mockReturnValueOnce(
            new Promise((resolve) => {
                resolveRefresh = resolve;
            }) as never,
        );

        fireEvent.click(screen.getByRole("button", { name: "refresh" }));

        expect(screen.getByTestId("loading")).toHaveTextContent("false");

        await act(async () => {
            resolveRefresh({ data: [site("Alpha"), site("Bravo")] });
        });
        await waitFor(() =>
            expect(screen.getByTestId("sites")).toHaveTextContent("Alpha,Bravo"),
        );
    });

    it("does not request users for a stored group the user does not belong to", async () => {
        localStorage.setItem("hunting_groupId", "foreign-group");

        render(
            <DataProvider>
                <Probe />
            </DataProvider>,
        );

        await waitFor(() => expect(usersApi.getUsers).toHaveBeenCalled());
        expect(usersApi.getUsers).not.toHaveBeenCalledWith("foreign-group");
        expect(usersApi.getUsers).toHaveBeenCalledWith("mine");
    });
});
