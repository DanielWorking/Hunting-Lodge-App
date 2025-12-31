import { Box, Typography, Button, Paper, Container } from "@mui/material";
import LockClockIcon from "@mui/icons-material/LockClock";
import { useUser } from "../context/UserContext";

export default function GuestPage() {
    const { logout, user } = useUser();

    return (
        <Container maxWidth="sm" sx={{ mt: 10 }}>
            <Paper elevation={3} sx={{ p: 4, textAlign: "center" }}>
                <Box display="flex" justifyContent="center" mb={2}>
                    <LockClockIcon
                        sx={{ fontSize: 60, color: "text.secondary" }}
                    />
                </Box>

                <Typography variant="h5" gutterBottom fontWeight="bold">
                    Welcome, {user?.username}
                </Typography>

                <Typography variant="body1" paragraph color="text.secondary">
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
    );
}
