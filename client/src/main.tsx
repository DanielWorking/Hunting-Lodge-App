import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { CssBaseline } from "@mui/material";
import { UserProvider } from "./context/UserContext";
import { NotificationProvider } from "./context/NotificationContext";
import { DataProvider } from "./context/DataContext";
import { ColorModeProvider } from "./context/ThemeContext";
import axios from "axios"; // <-- וודא שיש ייבוא של axios

// === הגדרת Interceptor גלובלי לאבטחה ===
// בכל בקשה שיוצאת לשרת, נבדוק אם יש משתמש מחובר ונוסיף את ה-ID שלו
axios.interceptors.request.use(
    (config) => {
        const userId = localStorage.getItem("hunting_userId");
        if (userId) {
            config.headers["x-user-id"] = userId;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);
// ========================================

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
