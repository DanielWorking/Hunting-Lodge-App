import React from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import { useUser } from "./context/UserContext";
import SitesPage from "./pages/SitesPage";
import TactiSitesPage from "./pages/TactiSitesPage";
import PhonesPage from "./pages/PhonesPage";
import AdminPage from "./pages/AdminPage";
import GroupSettingsPage from "./pages/GroupSettingsPage";
import ShiftSchedulePage from "./pages/ShiftSchedulePage";
import ShiftReportPage from "./pages/ShiftReportPage";
import ThinkingLoader from "./components/ThinkingLoader";

// רכיב הגנה משופר: ממתין לטעינת הנתונים לפני שהוא מחליט אם לזרוק החוצה
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isRestoringSession } = useUser();

    // 1. אם אנחנו עדיין מנסים להבין מי המשתמש (קוראים מ-localStorage)
    // נציג מסך טעינה במקום לזרוק אותו ישר החוצה
    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    // 2. רק אם סיימנו לטעון ועדיין אין משתמש - אז נזרוק ללוגין
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

function App() {
    return (
        <Router>
            <Navbar />
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <SitesPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/tacti-sites"
                    element={
                        <ProtectedRoute>
                            <TactiSitesPage />
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
        </Router>
    );
}

export default App;
