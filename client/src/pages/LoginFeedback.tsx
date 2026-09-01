/**
 * @module LoginFeedback
 *
 * Provides lazy-loaded feedback alerts and toast notifications for the Login page.
 * Isolated into a separate component to keep the critical login entry chunk lightweight.
 */

import { Alert, Snackbar } from "@mui/material";

export interface LoginFeedbackProps {
    /** Toast notification state */
    toast: {
        open: boolean;
        message: string;
        severity: "error" | "info";
    };
    /** Optional error code or message received from URL query parameters */
    urlError: string | null;
    /** Callback to close the feedback toast */
    onCloseToast: () => void;
}

/**
 * Renders URL-based authentication alerts and transient toast notifications.
 *
 * @param {LoginFeedbackProps} props - The component props.
 * @returns {JSX.Element} The rendered feedback alerts.
 */
export default function LoginFeedback({
    toast,
    urlError,
    onCloseToast,
}: LoginFeedbackProps) {
    return (
        <>
            {/* Display errors received via URL parameters (e.g., after a failed callback) */}
            {urlError && (
                <Alert severity="error" sx={{ width: "100%" }}>
                    Authentication failed. Please try again.
                </Alert>
            )}

            {/* Display transient feedback or error messages */}
            <Snackbar
                open={toast.open}
                autoHideDuration={6000}
                onClose={onCloseToast}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={onCloseToast}
                    severity={toast.severity}
                    sx={{ width: "100%" }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </>
    );
}
