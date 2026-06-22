/**
 * @module GuestPage
 *
 * Displays a landing page for users who have successfully authenticated via SSO
 * but have not yet been assigned to any group or granted specific permissions.
 */

import { Box, Typography, Button, Paper, Container } from "@mui/material";
import LockClockIcon from "@mui/icons-material/LockClock";
import { useUser } from "../context/UserContext";

/**
 * A landing page for unassigned users.
 *
 * Renders a "Pending Approval" status message and provides an option to logout.
 * This page is shown when a user is authenticated but lacks group assignments.
 *
 * @returns {JSX.Element} The rendered GuestPage component.
 */
export default function GuestPage() {
    const { logout, user } = useUser();

    return (
        <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight="100vh"
            sx={{
                background: (theme) => `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.light} 100%)`,
            }}
        >
            <Container maxWidth="sm">
                <Paper 
                    elevation={24} 
                    sx={{ 
                        p: 6, 
                        textAlign: "center",
                        borderRadius: 4,
                        backdropFilter: "blur(16px)",
                        backgroundColor: "background.paper",
                        boxShadow: (theme) => theme.palette.mode === "dark" ? "0 8px 32px rgba(0, 0, 0, 0.5)" : "0 8px 32px rgba(0, 0, 0, 0.1)",
                        transition: "transform 0.3s ease",
                        "&:hover": {
                            transform: "translateY(-4px)"
                        }
                    }}
                >
                    <Box display="flex" justifyContent="center" mb={3}>
                        <LockClockIcon
                            sx={{ 
                                fontSize: 72, 
                                color: "warning.main",
                                filter: (theme) => theme.palette.mode === "dark" ? "drop-shadow(0px 4px 8px rgba(0,0,0,0.5))" : "drop-shadow(0px 4px 8px rgba(0,0,0,0.1))"
                            }}
                        />
                    </Box>

                    <Typography variant="h4" gutterBottom fontWeight="900" color="text.primary">
                        Welcome, {user?.username}
                    </Typography>

                    <Typography variant="subtitle1" paragraph color="text.secondary" sx={{ mb: 4 }}>
                        Your account has been created successfully via SSO.
                    </Typography>

                <Box
                    sx={{
                        bgcolor: "warning.light",
                        p: 2,
                        borderRadius: 1,
                        my: 2,
                    }}
                >
                    <Typography
                        variant="body2"
                        color="warning.dark"
                        fontWeight="medium"
                    >
                        Pending Approval
                    </Typography>
                    <Typography variant="caption" color="warning.dark">
                        You are not assigned to any group yet. Please contact
                        your System Administrator or Team Leader to assign you
                        permissions.
                    </Typography>
                </Box>

                <Button
                    variant="outlined"
                    color="primary"
                    onClick={logout}
                    sx={{ mt: 2 }}
                >
                    Logout & Try Again
                </Button>
                </Paper>
            </Container>
        </Box>
    );
}
