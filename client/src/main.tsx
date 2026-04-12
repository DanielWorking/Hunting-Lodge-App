/**
 * @module main
 *
 * The main entry point for the React client application.
 * This file initializes the React root, configures global axios interceptors,
 * and wraps the application in necessary providers including Routing, Theme,
 * and Data contexts.
 */

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

/**
 * Configures a global axios request interceptor to inject the user ID from localStorage
 * into the 'x-user-id' header for all outgoing requests.
 */
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

/**
 * Initializes and renders the React application root.
 * The app is wrapped in StrictMode and several context providers:
 * - BrowserRouter: Handles client-side routing.
 * - DataProvider: Manages global application data.
 * - UserProvider: Manages user authentication and profile state.
 * - NotificationProvider: Handles global toast notifications.
 * - ColorModeProvider: Manages the theme (light/dark mode).
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrowserRouter>
            <DataProvider>
                <UserProvider>
                    <NotificationProvider>
                        <ColorModeProvider>
                            {/* CssBaseline resets CSS to a consistent baseline and applies theme-specific background colors (light/dark) */}
                            <CssBaseline />
                            <App />
                        </ColorModeProvider>
                    </NotificationProvider>
                </UserProvider>
            </DataProvider>
        </BrowserRouter>
    </React.StrictMode>,
);
