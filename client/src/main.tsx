/**
 * @module main
 *
 * The main entry point for the React client application.
 * This file initializes the React root, wraps the application in a global ErrorBoundary,
 * and sets up essential providers including Routing, User, Data, Notification,
 * and Theme contexts.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { DataProvider } from "./context/DataContext.tsx";
import { UserProvider } from "./context/UserContext.tsx";
import { NotificationProvider } from "./context/NotificationContext.tsx";
import { BrowserRouter } from "react-router-dom";

import { CssBaseline } from "@mui/material";
import { ColorModeProvider } from "./context/ThemeContext.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

/**
 * Initializes and renders the React application root.
 * The app is wrapped in StrictMode, a global ErrorBoundary, and several context providers:
 * - ErrorBoundary: Catches unhandled runtime rendering errors and displays a recovery UI.
 * - BrowserRouter: Handles client-side routing.
 * - UserProvider: Manages user authentication and profile state.
 * - DataProvider: Manages global application data.
 * - NotificationProvider: Handles global toast notifications.
 * - ColorModeProvider: Manages the theme (light/dark mode).
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <UserProvider>
                    <DataProvider>
                        <NotificationProvider>
                            <ColorModeProvider>
                                {/* CssBaseline resets CSS to a consistent baseline and applies theme-specific background colors (light/dark) */}
                                <CssBaseline />
                                <App />
                            </ColorModeProvider>
                        </NotificationProvider>
                    </DataProvider>
                </UserProvider>
            </BrowserRouter>
        </ErrorBoundary>
    </React.StrictMode>,
);

