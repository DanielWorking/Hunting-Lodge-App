/**
 * @module NotFoundPage
 *
 * Renders a branded 404 (Not Found) error page when users attempt to navigate
 * to an undefined or inaccessible frontend route. Provides quick navigation actions
 * back to the application dashboard or login portal.
 */

import { Box, Typography, Button, Paper, Container, Stack } from "@mui/material";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import HomeIcon from "@mui/icons-material/Home";
import LoginIcon from "@mui/icons-material/Login";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

/**
 * Branded 404 Page Component.
 *
 * Displays visual indicators and friendly messaging when a route is not found.
 * Provides context-aware action buttons based on the user's authentication state.
 *
 * @returns {JSX.Element} The rendered NotFoundPage component.
 */
export default function NotFoundPage() {
    const navigate = useNavigate();
    const { user } = useUser();

    return (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="100vh"
            sx={{
                background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.background.default} 100%)`,
                p: 3,
            }}
        >
            <Container maxWidth="sm">
                <Paper
                    elevation={24}
                    sx={{
                        p: { xs: 4, sm: 6 },
                        textAlign: "center",
                        borderRadius: 4,
                        backdropFilter: "blur(16px)",
                        backgroundColor: "background.paper",
                        boxShadow: (theme) =>
                            theme.palette.mode === "dark"
                                ? "0 8px 32px rgba(0, 0, 0, 0.6)"
                                : "0 8px 32px rgba(0, 0, 0, 0.12)",
                        transition: "transform 0.3s ease",
                        "&:hover": {
                            transform: "translateY(-4px)",
                        },
                    }}
                >
                    <Box display="flex" justifyContent="center" mb={2}>
                        <SearchOffIcon
                            sx={{
                                fontSize: 80,
                                color: "warning.main",
                                filter: (theme) =>
                                    theme.palette.mode === "dark"
                                        ? "drop-shadow(0px 4px 8px rgba(0,0,0,0.6))"
                                        : "drop-shadow(0px 4px 8px rgba(0,0,0,0.15))",
                            }}
                        />
                    </Box>

                    <Typography
                        variant="h2"
                        component="h1"
                        fontWeight="900"
                        color="primary"
                        sx={{
                            letterSpacing: "-1px",
                            mb: 1,
                            background: (theme) =>
                                `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.warning.main})`,
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                        }}
                    >
                        404
                    </Typography>

                    <Typography
                        variant="h5"
                        component="h2"
                        fontWeight="700"
                        color="text.primary"
                        gutterBottom
                    >
                        Page Not Found
                    </Typography>

                    <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mb: 4, maxWidth: 420, mx: "auto" }}
                    >
                        The page or resource you are looking for does not exist, has been moved,
                        or is currently unavailable.
                    </Typography>

                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        justifyContent="center"
                    >
                        {user ? (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<HomeIcon />}
                                onClick={() => navigate("/")}
                                sx={{
                                    py: 1.4,
                                    px: 3,
                                    fontWeight: "bold",
                                    borderRadius: 2,
                                    textTransform: "none",
                                }}
                            >
                                Back to Dashboard
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<LoginIcon />}
                                onClick={() => navigate("/login")}
                                sx={{
                                    py: 1.4,
                                    px: 3,
                                    fontWeight: "bold",
                                    borderRadius: 2,
                                    textTransform: "none",
                                }}
                            >
                                Go to Login
                            </Button>
                        )}

                        <Button
                            variant="outlined"
                            size="large"
                            onClick={() => navigate(-1)}
                            sx={{
                                py: 1.4,
                                px: 3,
                                borderRadius: 2,
                                textTransform: "none",
                            }}
                        >
                            Go Back
                        </Button>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
}
