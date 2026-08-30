/**
 * @module App
 *
 * The main application component that manages routing and layout.
 * This file defines the protected routes and the overall structure of the
 * application, including the conditional display of the navigation bar.
 */

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import SSOCallback from "./pages/SSOCallback";
import GuestPage from "./pages/GuestPage";
import { useUser } from "./context/UserContext";
import { useData } from "./context/DataContext";
import ThinkingLoader from "./components/ThinkingLoader";

// Page imports
import SitesPage from "./pages/SitesPage";
import PhonesPage from "./pages/PhonesPage";
import AdminPage from "./pages/AdminPage";
import GroupSettingsPage from "./pages/GroupSettingsPage";
import ShiftSchedulePage from "./pages/ShiftSchedulePage";
import ShiftReportPage from "./pages/ShiftReportPage";
import NotFoundPage from "./pages/NotFoundPage";

/**
 * A wrapper component for routes that require active Administrator privileges.
 *
 * It checks the current user's state:
 * - Shows a loading indicator while the session is being restored or data is initializing.
 * - Redirects to login if unauthenticated.
 * - Redirects to home (/) if the user is not actively connected as an Administrator.
 *
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render if authorized.
 * @returns {JSX.Element} The rendered children or redirect/loader.
 */
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isAdmin, isRestoringSession } = useUser();
    const { loading } = useData();

    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (loading) {
        return <ThinkingLoader />;
    }

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

/**
 * A wrapper component for routes that require active Shift Manager privileges within the current group.
 *
 * It checks the current user's state:
 * - Shows a loading indicator while the session is being restored or data is initializing.
 * - Redirects to login if unauthenticated.
 * - Redirects to home (/) if the user is not an active shift manager of the selected group.
 *
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render if authorized.
 * @returns {JSX.Element} The rendered children or redirect/loader.
 */
const ShiftManagerRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, currentGroup, isShiftManager, isRestoringSession } = useUser();
    const { loading } = useData();

    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (loading) {
        return <ThinkingLoader />;
    }

    if (!currentGroup || !isShiftManager) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

/**
 * A wrapper component for routes that require authentication and group membership.
 *
 * It checks the current user's state:
 * - Shows a loading indicator while the session is being restored or data is initializing.
 * - Redirects to the login page if the user is not authenticated.
 * - Redirects to the guest page if the user is authenticated but not part of any group.
 *
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render if authorized.
 * @returns {JSX.Element} The rendered children or a redirect/loader.
 */
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isRestoringSession } = useUser();
    const { loading } = useData();

    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (loading) {
        return <ThinkingLoader />;
    }

    if (user.groups.length === 0) {
        return <Navigate to="/guest" replace />;
    }

    return <>{children}</>;
};

/**
 * The root component of the application.
 *
 * Manages the top-level routing structure and displays the global navigation bar
 * when the user is authenticated and has group access.
 *
 * @returns {JSX.Element} The rendered application layout and routes.
 */
function App() {
    const { user, isRestoringSession } = useUser();

    const showNavbar = user && user.groups.length > 0;

    return (
        <>
            {showNavbar && <Navbar />}
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/auth/callback" element={<SSOCallback />} />
                <Route
                    path="/guest"
                    element={
                        isRestoringSession ? (
                            <ThinkingLoader />
                        ) : user && user.groups.length === 0 ? (
                            <GuestPage />
                        ) : (
                            <Navigate to="/" replace />
                        )
                    }
                />

                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <SitesPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/phones"
                    element={
                        <ProtectedRoute>
                            <PhonesPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/group-settings"
                    element={
                        <ShiftManagerRoute>
                            <GroupSettingsPage />
                        </ShiftManagerRoute>
                    }
                />
                <Route
                    path="/schedule"
                    element={
                        <ProtectedRoute>
                            <ShiftSchedulePage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/reports"
                    element={
                        <ProtectedRoute>
                            <ShiftReportPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin/users"
                    element={
                        <AdminRoute>
                            <AdminPage />
                        </AdminRoute>
                    }
                />

                {/* Catch-all route for unmatched paths */}
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
        </>
    );
}

export default App;
