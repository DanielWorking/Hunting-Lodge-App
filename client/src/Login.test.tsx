import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Login from "./pages/Login";
import LoginPage from "./pages/LoginPage";
import * as authApi from "./api/authApi";

vi.mock("./api/authApi", () => ({
    getSsoUrl: vi.fn(),
    loginWithCode: vi.fn(),
    getMe: vi.fn(),
}));

describe("Login and LoginPage Component - Performance & Error Handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders Login page correctly with single semantic h1 and SSO button", () => {
        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hunting Lodge");
        expect(screen.getByText("Secure Shift Management")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Login with Organization SSO/i })).toBeInTheDocument();
    });

    it("renders LoginPage identically ensuring full re-export compatibility", () => {
        render(
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hunting Lodge");
        expect(screen.getByRole("button", { name: /Login with Organization SSO/i })).toBeInTheDocument();
    });

    it("handles successful SSO URL redirection", async () => {
        let assignedHref = "";
        const originalLocation = window.location;
        
        Object.defineProperty(window, "location", {
            writable: true,
            value: {
                ...originalLocation,
                set href(val: string) {
                    assignedHref = val;
                },
                get href() {
                    return assignedHref;
                },
            },
        });

        vi.mocked(authApi.getSsoUrl).mockResolvedValue({
            data: { url: "https://auth.example.com/sso" },
        } as any);

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>,
        );

        const ssoButton = screen.getByRole("button", { name: /Login with Organization SSO/i });
        fireEvent.click(ssoButton);

        await waitFor(() => {
            expect(authApi.getSsoUrl).toHaveBeenCalledTimes(1);
            expect(assignedHref).toBe("https://auth.example.com/sso");
        });

        Object.defineProperty(window, "location", {
            writable: true,
            value: originalLocation,
        });
    });

    it("handles SSO API failure gracefully by displaying toast error alert", async () => {
        vi.mocked(authApi.getSsoUrl).mockRejectedValue(new Error("Network Error"));

        render(
            <MemoryRouter>
                <Login />
            </MemoryRouter>,
        );

        const ssoButton = screen.getByRole("button", { name: /Login with Organization SSO/i });
        fireEvent.click(ssoButton);

        expect(
            await screen.findByText(
                "Failed to connect to SSO server. Please check your connection or contact support.",
            ),
        ).toBeInTheDocument();
    });

    it("renders URL error alert when error query param is present in URL", async () => {
        render(
            <MemoryRouter initialEntries={["/login?error=session_expired"]}>
                <Login />
            </MemoryRouter>,
        );

        expect(
            await screen.findByText("Authentication failed. Please try again."),
        ).toBeInTheDocument();
    });
});
