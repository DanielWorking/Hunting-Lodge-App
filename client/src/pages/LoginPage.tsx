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

export default function LoginPage() {
    const [loading, setLoading] = useState(false);
    const [searchParams] = useSearchParams();

    // ניהול ה-Snackbar (הודעות קופצות)
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

    const handleCloseToast = () => {
        setToast({ ...toast, open: false });
    };

    const handleSSOClick = async () => {
        try {
            setLoading(true);
            // שלב 1: בקשת כתובת ה-SSO מהשרת
            const response = await axios.get("/api/auth/sso-url");

            if (response.data.url) {
                // שלב 3: הפניה מלאה ל-SSO
                window.location.href = response.data.url;
            } else {
                throw new Error("No URL returned from server");
            }
        } catch (err: any) {
            console.error("Failed to start SSO flow", err);
            setLoading(false);

            // הצגת הודעה יפה במקום alert
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

                {/* שגיאות שמגיעות מה-URL (למשל אחרי כישלון ב-Callback) */}
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

            {/* רכיב ההודעות החדש */}
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
