import { useEffect } from "react";
import {
    Container,
    Paper,
    Button,
    Typography,
    Box,
    Alert,
} from "@mui/material";
import { useUser } from "../context/UserContext";
import { useColorMode } from "../context/ThemeContext";

export default function LoginPage() {
    const { login } = useUser();
    const { setMode } = useColorMode();

    // קביעה למצב בהיר במסך התחברות (לפי הקוד המקורי שלך)
    useEffect(() => {
        setMode("light");
    }, []);

    const handleSSOLogin = () => {
        login(); // הפניה לשרת
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
                        padding: 4,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        width: "100%",
                        borderRadius: 2,
                    }}
                >
                    <Typography
                        component="h1"
                        variant="h5"
                        align="center"
                        gutterBottom
                        sx={{ mb: 3 }}
                    >
                        Hunting Lodge
                        <br />
                        <span style={{ fontSize: "0.8em", color: "gray" }}>
                            Secure Login
                        </span>
                    </Typography>

                    <Alert severity="info" sx={{ mb: 3, width: "100%" }}>
                        המערכת זמינה לעובדי הארגון בלבד דרך הרשת הפנימית.
                    </Alert>

                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        onClick={handleSSOLogin}
                        sx={{
                            mt: 1,
                            mb: 2,
                            height: 50,
                            fontSize: "1.1rem",
                        }}
                    >
                        התחברות ארגונית (SSO)
                    </Button>

                    <Typography
                        variant="caption"
                        color="text.secondary"
                        align="center"
                    >
                        Secure Authentication via OpenID Connect
                    </Typography>
                </Paper>
            </Box>
        </Container>
    );
}
