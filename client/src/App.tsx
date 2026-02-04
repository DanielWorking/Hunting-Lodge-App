import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import SSOCallback from "./pages/SSOCallback";
import GuestPage from "./pages/GuestPage";
import { useUser } from "./context/UserContext";
import ThinkingLoader from "./components/ThinkingLoader";

// דפים
import SitesPage from "./pages/SitesPage";
import PhonesPage from "./pages/PhonesPage";
import AdminPage from "./pages/AdminPage";
import GroupSettingsPage from "./pages/GroupSettingsPage";
import ShiftSchedulePage from "./pages/ShiftSchedulePage";
import ShiftReportPage from "./pages/ShiftReportPage";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isRestoringSession } = useUser();

    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.groups.length === 0) {
        return <Navigate to="/guest" replace />;
    }

    return <>{children}</>;
};

function App() {
    const { user } = useUser();

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
                        user && user.groups.length === 0 ? (
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

                {/* TactiSites Route Removed */}

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
                        <ProtectedRoute>
                            <GroupSettingsPage />
                        </ProtectedRoute>
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
                        <ProtectedRoute>
                            <AdminPage />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </>
    );
}

export default App;
