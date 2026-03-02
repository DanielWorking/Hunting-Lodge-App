import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { DataProvider } from "./context/DataContext.tsx";
import { UserProvider } from "./context/UserContext.tsx";
import { NotificationProvider } from "./context/NotificationContext.tsx";
import { BrowserRouter } from "react-router-dom";
import axios from "axios";

import { CssBaseline } from "@mui/material";
import { ColorModeProvider } from "./context/ThemeContext.tsx";

axios.interceptors.request.use(
    (config) => {
        const userId = localStorage.getItem("hunting_userId");
        if (userId) {
            config.headers["x-user-id"] = userId;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrowserRouter>
            <DataProvider>
                <UserProvider>
                    <NotificationProvider>
                        <ColorModeProvider>
                            {/* CssBaseline דואג לאפס את ה-CSS ולהחיל את צבע הרקע (כהה/בהיר) */}
                            <CssBaseline />
                            <App />
                        </ColorModeProvider>
                    </NotificationProvider>
                </UserProvider>
            </DataProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
