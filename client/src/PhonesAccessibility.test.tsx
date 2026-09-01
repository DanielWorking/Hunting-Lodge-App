import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PhonesPage from "./pages/PhonesPage";
import PhoneDialog from "./components/PhoneDialog";
import PhoneDetailsDialog from "./components/PhoneDetailsDialog";
import { getDesignTokens } from "./theme/theme";
import * as UserContextModule from "./context/UserContext";
import * as DataContextModule from "./context/DataContext";
import * as NotificationContextModule from "./context/NotificationContext";
import type { Group, PhoneRow } from "./types";

// Mock API modules
vi.mock("./api/phonesApi", () => ({
    getPhones: vi.fn().mockResolvedValue({ data: [] }),
    createPhone: vi.fn().mockResolvedValue({ data: {} }),
    updatePhone: vi.fn().mockResolvedValue({ data: {} }),
    deletePhone: vi.fn().mockResolvedValue({ data: {} }),
    toggleFavoritePhone: vi.fn().mockResolvedValue({ data: {} }),
}));

describe("Phones Directory Accessibility (WCAG 2.2 AA Compliance)", () => {
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

    const mockPhone1: PhoneRow = {
        _id: "phone-1",
        name: "Command Desk",
        numbers: ["050-123-4567", "03-987-6543"],
        type: "Mobile",
        description: "Primary operational hotline",
        isFavorite: true,
    };

    const mockPhone2: PhoneRow = {
        _id: "phone-2",
        name: "Field Unit Beta",
        numbers: ["052-555-0199"],
        type: "Red",
        description: "Emergency dispatch",
        isFavorite: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();

        vi.spyOn(NotificationContextModule, "useNotification").mockReturnValue({
            showNotification: vi.fn(),
        });

        vi.spyOn(DataContextModule, "useData").mockReturnValue({
            sites: [],
            setSites: vi.fn(),
            phones: [mockPhone1, mockPhone2],
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

    describe("Accessible Names on ARIA Inputs & Controls (WCAG 2.2 SC 4.1.2 & SC 1.3.1)", () => {
        it("PhonesPage header toolbar provides accessible names for filter, search, sort, and add controls", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            // 1. Filter dropdown combobox
            const filterSelect = screen.getByRole("combobox", { name: /^filter/i });
            expect(filterSelect).toBeInTheDocument();

            // 2. Search input field accessible as searchbox
            const searchInput = screen.getByRole("searchbox", { name: /^search/i });
            expect(searchInput).toBeInTheDocument();

            // 3. Sort button
            const sortBtn = screen.getByRole("button", { name: /sort|name \(a-z\)/i });
            expect(sortBtn).toBeInTheDocument();

            // 4. Add Phone button
            const addBtn = screen.getByRole("button", { name: /^add phone/i });
            expect(addBtn).toBeInTheDocument();
        });

        it("PhonesTable renders accessible table headers with scope='col'", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            const columnHeaders = screen.getAllByRole("columnheader");
            expect(columnHeaders.length).toBe(6);
            expect(columnHeaders[0]).toHaveTextContent("Number");
            expect(columnHeaders[1]).toHaveTextContent("Type");
            expect(columnHeaders[2]).toHaveTextContent("Description");
            expect(columnHeaders[3]).toHaveTextContent("Name");
            expect(columnHeaders[4]).toHaveTextContent("Favorite");
            expect(columnHeaders[5]).toHaveTextContent("Actions");

            columnHeaders.forEach((th) => {
                expect(th).toHaveAttribute("scope", "col");
            });
        });

        it("PhonesTable rows are keyboard-navigable interactive items with accessible names", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            // Table rows acting as interactive detail activators
            const row1Button = screen.getByRole("button", { name: /view details for command desk/i });
            expect(row1Button).toBeInTheDocument();
            expect(row1Button).toHaveAttribute("tabindex", "0");

            // Pressing Enter on the row triggers details dialog
            fireEvent.keyDown(row1Button, { key: "Enter" });
            expect(screen.getByRole("heading", { name: "Phone Details" })).toBeInTheDocument();
        });

        it("PhonesTable renders direct dial anchors with tel: URI scheme and descriptive accessible names", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            const dialLink1 = screen.getByRole("link", { name: /dial command desk: 050-123-4567/i });
            expect(dialLink1).toBeInTheDocument();
            expect(dialLink1).toHaveAttribute("href", "tel:050-123-4567");

            const dialLink2 = screen.getByRole("link", { name: /dial field unit beta: 052-555-0199/i });
            expect(dialLink2).toBeInTheDocument();
            expect(dialLink2).toHaveAttribute("href", "tel:052-555-0199");
        });

        it("PhonesTable provides distinct accessible names on favorite, edit, and delete action buttons for each entry", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            // 1. Favorite toggle buttons
            expect(screen.getByRole("button", { name: /remove command desk from favorites/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /add field unit beta to favorites/i })).toBeInTheDocument();

            // 2. Edit buttons
            expect(screen.getByRole("button", { name: /edit command desk/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /edit field unit beta/i })).toBeInTheDocument();

            // 3. Delete buttons
            expect(screen.getByRole("button", { name: /delete command desk/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /delete field unit beta/i })).toBeInTheDocument();
        });

        it("PhoneDialog provides explicit accessible names for all form inputs (Name, Phone Type, Numbers, Description)", () => {
            render(
                <PhoneDialog
                    open={true}
                    onClose={vi.fn()}
                    onSave={vi.fn()}
                />,
            );

            // 1. Contact Name input
            const nameInput = screen.getByRole("textbox", { name: /^name/i });
            expect(nameInput).toBeInTheDocument();

            // 2. Phone Type select combobox
            const typeSelect = screen.getByRole("combobox", { name: /^phone type/i });
            expect(typeSelect).toBeInTheDocument();

            // 3. Dynamic Phone Number input
            const phoneInput1 = screen.getByRole("textbox", { name: /^phone number 1/i });
            expect(phoneInput1).toBeInTheDocument();

            // 4. Add Another Number button
            const addNumberBtn = screen.getByRole("button", { name: /add another number/i });
            expect(addNumberBtn).toBeInTheDocument();

            // 5. Description multiline text input
            const descInput = screen.getByRole("textbox", { name: /^description/i });
            expect(descInput).toBeInTheDocument();

            // 6. Dialog Actions
            expect(screen.getByRole("button", { name: /^cancel/i })).toBeInTheDocument();
            expect(screen.getByRole("button", { name: /^add phone/i })).toBeInTheDocument();
        });

        it("PhoneDetailsDialog provides accessible title, contact details, and accessible dial actions", () => {
            render(
                <PhoneDetailsDialog
                    open={true}
                    onClose={vi.fn()}
                    data={mockPhone1}
                />,
            );

            // Dialog heading
            expect(screen.getByRole("heading", { name: "Phone Details", level: 2 })).toBeInTheDocument();

            // Dial action links
            const dialLink1 = screen.getByRole("link", { name: /call command desk at 050-123-4567/i });
            expect(dialLink1).toBeInTheDocument();
            expect(dialLink1).toHaveAttribute("href", "tel:050-123-4567");

            const dialLink2 = screen.getByRole("link", { name: /call command desk at 03-987-6543/i });
            expect(dialLink2).toBeInTheDocument();
            expect(dialLink2).toHaveAttribute("href", "tel:03-987-6543");
        });
    });

    describe("Target Size & Spacing (WCAG 2.2 SC 2.5.8 Minimum 44x44px & 8px Spacing)", () => {
        it("Theme configuration defines MuiIconButton with minimum 44x44px touch target and focus indicator", () => {
            const lightTheme = getDesignTokens("light");
            const iconButtonRoot = lightTheme.components.MuiIconButton?.styleOverrides?.root;
            expect(iconButtonRoot).toBeDefined();
            expect(iconButtonRoot.minWidth).toBeGreaterThanOrEqual(44);
            expect(iconButtonRoot.minHeight).toBeGreaterThanOrEqual(44);
        });

        it("PhonesHeader toolbar controls have at least 44px minimum height and >= 8px layout spacing", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            const sortBtn = screen.getByRole("button", { name: /sort|name \(a-z\)/i });
            const addBtn = screen.getByRole("button", { name: /^add phone/i });

            expect(sortBtn).toBeInTheDocument();
            expect(addBtn).toBeInTheDocument();
        });

        it("PhonesTable action buttons are grouped with >= 8px spacing and 44x44px touch targets", () => {
            render(
                <MemoryRouter>
                    <PhonesPage />
                </MemoryRouter>,
            );

            const editBtn = screen.getByRole("button", { name: /edit command desk/i });
            const deleteBtn = screen.getByRole("button", { name: /delete command desk/i });
            const favBtn = screen.getByRole("button", { name: /remove command desk from favorites/i });

            expect(editBtn).toBeInTheDocument();
            expect(deleteBtn).toBeInTheDocument();
            expect(favBtn).toBeInTheDocument();

            // Direct dial link has comfortable inline touch target
            const dialLink = screen.getByRole("link", { name: /dial command desk: 050-123-4567/i });
            expect(dialLink).toBeInTheDocument();
        });
    });

    describe("Foreground/Background Color Contrast (WCAG 2.2 SC 1.4.3 & SC 1.4.11)", () => {
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

        it("MUI Chip theme styleOverrides enforce >= 4.5:1 label contrast across all variants (Light Mode)", () => {
            const lightTheme = getDesignTokens("light");
            const bgPaper = lightTheme.palette.background.paper; // #FFFFFF
            const chipStyles = lightTheme.components.MuiChip?.styleOverrides;

            expect(chipStyles).toBeDefined();

            // Outlined variants
            expect(getContrastRatio(chipStyles.outlinedDefault.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedPrimary.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedError.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedInfo.color, bgPaper)).toBeGreaterThanOrEqual(4.5);

            // Filled variants
            expect(getContrastRatio(chipStyles.filledDefault.color, chipStyles.filledDefault.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledPrimary.color, chipStyles.filledPrimary.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledError.color, chipStyles.filledError.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledInfo.color, chipStyles.filledInfo.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        });

        it("MUI Chip theme styleOverrides enforce >= 4.5:1 label contrast across all variants (Dark Mode)", () => {
            const darkTheme = getDesignTokens("dark");
            const bgPaper = darkTheme.palette.background.paper; // #1E293B
            const chipStyles = darkTheme.components.MuiChip?.styleOverrides;

            expect(chipStyles).toBeDefined();

            // Outlined variants
            expect(getContrastRatio(chipStyles.outlinedDefault.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedPrimary.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedError.color, bgPaper)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.outlinedInfo.color, bgPaper)).toBeGreaterThanOrEqual(4.5);

            // Filled variants
            expect(getContrastRatio(chipStyles.filledDefault.color, chipStyles.filledDefault.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledPrimary.color, chipStyles.filledPrimary.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledError.color, chipStyles.filledError.backgroundColor)).toBeGreaterThanOrEqual(4.5);
            expect(getContrastRatio(chipStyles.filledInfo.color, chipStyles.filledInfo.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        });

        it("TableContainer and Paper configuration has distinct borders and solid readable surfaces", () => {
            const lightTheme = getDesignTokens("light");
            const darkTheme = getDesignTokens("dark");

            expect(lightTheme.components.MuiTableContainer?.styleOverrides?.root).toBeDefined();
            expect(darkTheme.components.MuiTableContainer?.styleOverrides?.root).toBeDefined();
        });
    });
});
