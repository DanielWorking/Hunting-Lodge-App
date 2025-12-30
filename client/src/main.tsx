import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { CssBaseline } from "@mui/material";
import { UserProvider } from "./context/UserContext";
import { NotificationProvider } from "./context/NotificationContext";
import { DataProvider } from "./context/DataContext";
import { ColorModeProvider } from "./context/ThemeContext";
import axios from "axios";

// === הגדרות גלובליות לתקשורת ===

// קביעת כתובת השרת (לוקאלי או ייצור) לפי משתני הסביבה
axios.defaults.baseURL =
    import.meta.env.VITE_API_URL || "http://localhost:5000";

// חובה! מאפשר שליחת עוגיות (Session) בכל בקשה מול השרת
axios.defaults.withCredentials = true;

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <DataProvider>
            <ColorModeProvider>
                <UserProvider>
                    <NotificationProvider>
                        <CssBaseline />
                        <App />
                    </NotificationProvider>
                </UserProvider>
            </ColorModeProvider>
        </DataProvider>
    </React.StrictMode>
);
