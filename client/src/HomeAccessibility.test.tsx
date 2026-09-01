import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SitesPage from "./pages/SitesPage";
import SiteDialog from "./components/SiteDialog";
import { getDesignTokens } from "./theme/theme";
import * as UserContextModule from "./context/UserContext";
import * as DataContextModule from "./context/DataContext";
import * as NotificationContextModule from "./context/NotificationContext";
import type { Group, SiteCard } from "./types";

// Mock API modules
vi.mock("./api/sitesApi", () => ({
    getSites: vi.fn().mockResolvedValue({ data: [] }),
    createSite: vi.fn().mockResolvedValue({ data: {} }),
    updateSite: vi.fn().mockResolvedValue({ data: {} }),
    deleteSite: vi.fn().mockResolvedValue({ data: {} }),
    toggleFavoriteSite: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("./api/groupsApi", () => ({
    getGroups: vi.fn().mockResolvedValue({ data: [] }),
    addGroupTag: vi.fn().mockResolvedValue({ data: {} }),
    renameGroupTag: vi.fn().mockResolvedValue({ data: {} }),
    deleteGroupTag: vi.fn().mockResolvedValue({ data: {} }),
}));

describe("Home Page & Form Accessibility (WCAG 2.2 AA Compliance)", () => {
    const mockGroup: Group = {
        _id: "group-1",
        name: "Command Center",
        members: ["user-1"],
        createdAt: new Date().toISOString(),
        siteTags: ["HQ", "Field"],
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

    describe("Accessible Names on ARIA Inputs (WCAG 2.2 SC 4.1.2 & SC 1.3.1)", () => {
        it("SitesPage controls bar provides accessible names for all filter and search inputs via getByRole", () => {
            render(
                <MemoryRouter>
                    <SitesPage />
                </MemoryRouter>,
            );

            // 1. Favorite Filter select combobox
            const showSelect = screen.getByRole("combobox", { name: /^show$/i });
            expect(showSelect).toBeInTheDocument();

            // 2. Search Sites text box
            const searchInput = screen.getByRole("textbox", { name: /^search sites/i });
            expect(searchInput).toBeInTheDocument();

            // 3. Sort Order select combobox
            const sortSelect = screen.getByRole("combobox", { name: /^sort by$/i });
            expect(sortSelect).toBeInTheDocument();
        });

        it("SitesPage Tag Dialog provides an accessible name for Tag Name input", () => {
            render(
                <MemoryRouter>
                    <SitesPage />
                </MemoryRouter>,
            );

            // Click the Create new tag button to open dialog
            const addTagBtn = screen.getByRole("button", { name: "Create new tag" });
            fireEvent.click(addTagBtn);

            // Verify Tag Name text input is accessible by role and name
            const tagInput = screen.getByRole("textbox", { name: /^tag name$/i });
            expect(tagInput).toBeInTheDocument();
        });

        it("SiteDialog provides explicit accessible names for all form inputs (name, url, tag, image, description)", () => {
            render(
                <SiteDialog
                    open={true}
                    onClose={vi.fn()}
                    onSave={vi.fn()}
                    currentGroup={mockGroup}
                />,
            );

            // 1. Site Name input
            const nameInput = screen.getByRole("textbox", { name: /^site name/i });
            expect(nameInput).toBeInTheDocument();

            // 2. URL input (distinguished from Image URL)
            const urlInput = screen.getByRole("textbox", { name: /^url/i });
            expect(urlInput).toBeInTheDocument();

            // 3. Tag select combobox
            const tagSelect = screen.getByRole("combobox", { name: /^tag$/i });
            expect(tagSelect).toBeInTheDocument();

            // 4. Image URL input
            const imageInput = screen.getByRole("textbox", { name: /^image url/i });
            expect(imageInput).toBeInTheDocument();

            // 5. Description textarea / multiline input
            const descInput = screen.getByRole("textbox", { name: /^description/i });
            expect(descInput).toBeInTheDocument();
        });
    });

    describe("Theme Foreground/Background Color Contrast (WCAG 2.2 SC 1.4.3 & SC 1.4.11)", () => {
        /**
         * Calculates relative luminance of an sRGB hex color according to WCAG 2.2 formula.
         */
        const getRelativeLuminance = (hex: string): number => {
            const cleanHex = hex.replace("#", "");
            const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
            const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
            const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

            const toLinear = (c: number) =>
                c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

            return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
        };

        /**
         * Calculates WCAG contrast ratio between two hex colors.
         */
        const getContrastRatio = (hex1: string, hex2: string): number => {
            const l1 = getRelativeLuminance(hex1);
            const l2 = getRelativeLuminance(hex2);
            const lighter = Math.max(l1, l2);
            const darker = Math.min(l1, l2);
            return (lighter + 0.05) / (darker + 0.05);
        };

        it("Light Mode theme tokens meet WCAG 2.2 AA contrast ratios (>= 4.5:1 for text, >= 3.0:1 for UI borders)", () => {
            const lightTheme = getDesignTokens("light");
            const bgDefault = lightTheme.palette.background.default; // #F8FAFC
            const bgPaper = lightTheme.palette.background.paper; // #FFFFFF
            const textPrimary = lightTheme.palette.text.primary;
            const textSecondary = lightTheme.palette.text.secondary;
            const primaryMain = lightTheme.palette.primary.main;
            const buttonBg = lightTheme.components.MuiButton.styleOverrides.containedPrimary.backgroundColor;
            const buttonColor = lightTheme.components.MuiButton.styleOverrides.containedPrimary.color;
            const inputBorder = lightTheme.components.MuiOutlinedInput.styleOverrides.notchedOutline.borderColor;

            // Text on default & paper background >= 4.5:1
            expect(getContrastRatio(textPrimary, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textPrimary, bgDefault)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textSecondary, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textSecondary, bgDefault)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(primaryMain, bgPaper)).toBeGreaterThanOrEqual(4.5);

            // Primary Contained Button Text >= 4.5:1
            expect(getContrastRatio(buttonColor, buttonBg)).toBeGreaterThanOrEqual(4.5);

            // Input Border Non-Text Contrast (SC 1.4.11) >= 3.0:1
            expect(getContrastRatio(inputBorder, bgPaper)).toBeGreaterThanOrEqual(3.0);
        });

        it("Dark Mode theme tokens meet WCAG 2.2 AA contrast ratios (>= 4.5:1 for text, >= 3.0:1 for UI borders)", () => {
            const darkTheme = getDesignTokens("dark");
            const bgDefault = darkTheme.palette.background.default; // #0F172A
            const bgPaper = darkTheme.palette.background.paper; // #1E293B
            const textPrimary = darkTheme.palette.text.primary;
            const textSecondary = darkTheme.palette.text.secondary;
            const primaryMain = darkTheme.palette.primary.main;
            const buttonBg = darkTheme.components.MuiButton.styleOverrides.containedPrimary.backgroundColor;
            const buttonColor = darkTheme.components.MuiButton.styleOverrides.containedPrimary.color;
            const inputBorder = darkTheme.components.MuiOutlinedInput.styleOverrides.notchedOutline.borderColor;

            // Text on default & paper background >= 4.5:1
            expect(getContrastRatio(textPrimary, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textPrimary, bgDefault)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textSecondary, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(textSecondary, bgDefault)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(primaryMain, bgDefault)).toBeGreaterThanOrEqual(4.5);

            // Primary Contained Button Text >= 4.5:1
            expect(getContrastRatio(buttonColor, buttonBg)).toBeGreaterThanOrEqual(4.5);

            // Input Border Non-Text Contrast (SC 1.4.11) >= 3.0:1
            expect(getContrastRatio(inputBorder, bgPaper)).toBeGreaterThanOrEqual(3.0);
        });
    });
});
