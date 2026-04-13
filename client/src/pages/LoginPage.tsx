/**
 * @module LoginPage
 *
 * Provides the entry point for user authentication.
 * Handles redirection to the organization's SSO provider and
 * displays authentication-related errors or status messages.
 */

import { useState } from "react";
import {
    Box,
    Button,
    Typography,
    Paper,
    Alert,
    Snackbar,
    CircularProgress,
} from "@mui/material";
import LoginIcon from "@mui/icons-material/Login";
import axios from "axios";
import { useSearchParams } from "react-router-dom";

/**
 * The primary login page component.
 *
 * Manages the SSO authentication flow, including fetching the SSO URL
 * from the backend and redirecting the user. It also handles the display
 * of feedback via Snackbars and URL-based error parameters.
 *
 * @returns {JSX.Element} The rendered LoginPage component.
 */
export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [searchParams] = useSearchParams();

    // Snackbar (toast) state management for user feedback
    const [toast, setToast] = useState<{
        open: boolean;
        message: string;
        severity: "error" | "info";
    }>({
        open: false,
        message: "",
        severity: "info",
    });

    const urlError = searchParams.get("error");

    /**
     * Closes the feedback Snackbar.
     */
    const handleCloseToast = () => {
        setToast({ ...toast, open: false });
    };

    /**
     * Initiates the SSO authentication process.
     * Fetches the redirection URL from the backend and performs a full page redirect.
     *
     * @throws {Error} If the server fails to return a valid SSO URL.
     */
    const handleSSOClick = async () => {
        try {
            setLoading(true);
            // Step 1: Request the SSO provider's URL from the server
            const response = await axios.get("/api/auth/sso-url");

            if (response.data.url) {
                // Step 2: Redirect the browser to the SSO provider
                window.location.href = response.data.url;
            } else {
                throw new Error("No URL returned from server");
            }
        } catch (err: any) {
            console.error("Failed to start SSO flow", err);
            setLoading(false);

            // Display a user-friendly error message via Snackbar
            setToast({
                open: true,
                message:
                    "Failed to connect to SSO server. Please check your connection or contact support.",
                severity: "error",
            });
        }
    };

    return (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="100vh"
            bgcolor="#f5f5f5"
        >
            <Paper
                elevation={3}
                sx={{
                    p: 5,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    maxWidth: 400,
                    width: "100%",
                }}
            >
                <Typography variant="h4" fontWeight="bold" color="primary">
                    Hunting Lodge
                </Typography>

                <Typography variant="body1" color="text.secondary">
                    Secure Shift Management
                </Typography>

                {/* Display errors received via URL parameters (e.g., after a failed callback) */}
                {urlError && (
                    <Alert severity="error" sx={{ width: "100%" }}>
                        Authentication failed. Please try again.
                    </Alert>
                )}

                <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={
                        loading ? (
                            <CircularProgress size={20} color="inherit" />
                        ) : (
                            <LoginIcon />
                        )
                    }
                    onClick={handleSSOClick}
                    disabled={loading}
                    sx={{ py: 1.5, fontWeight: "bold" }}
                >
                    {loading ? "Redirecting..." : "Login with Organization SSO"}
                </Button>
            </Paper>

            <Snackbar
                open={toast.open}
                autoHideDuration={6000}
                onClose={handleCloseToast}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={handleCloseToast}
                    severity={toast.severity}
                    sx={{ width: "100%" }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
