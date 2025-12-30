import { useState, useEffect } from "react";
import {
    Container,
    Paper,
    TextField,
    Button,
    Typography,
    Box,
    Alert,
} from "@mui/material";
import { useUser } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import { useColorMode } from "../context/ThemeContext"; // <-- Import

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const { login } = useUser();
    const navigate = useNavigate();

    // אנחנו מושכים את הפונקציה החדשה setMode
    const { setMode } = useColorMode();

    // === התיקון: קביעה חד משמעית למצב בהיר ===
    useEffect(() => {
        setMode("light");
    }, []);

    const handleLogin = async () => {
        const success = await login(username, "password123");

        if (success) {
            navigate("/");
        } else {
            setError('User not found. Try "Regular", "Regular2" or "Admin"');
        }
    };

    return (
        <Container maxWidth="xs">
            <Box
                sx={{
                    marginTop: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Paper
                    elevation={3}
                    sx={{
                        p: 4,
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                    }}
                >
                    <Typography
                        component="h1"
                        variant="h5"
                        align="center"
                        gutterBottom
                    >
                        Hunting Lodge Login
                    </Typography>

                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Username"
                        variant="outlined"
                        fullWidth
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                    />

                    <TextField
                        label="Password"
                        type="password"
                        variant="outlined"
                        fullWidth
                        disabled
                        placeholder="Any password works"
                    />

                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        onClick={handleLogin}
                    >
                        Sign In
                    </Button>

                    <Alert severity="info" sx={{ mt: 2 }}>
                        Users available: <b>Regular</b>, <b>Regular2</b>,{" "}
                        <b>Admin</b>
                    </Alert>
                </Paper>
            </Box>
        </Container>
    );
}
