import React from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import Navbar from "./components/Navbar";
import LoginPage from "./pages/LoginPage";
import SSOCallback from "./pages/SSOCallback"; // הדף החדש
import GuestPage from "./pages/GuestPage"; // הדף החדש
import { useUser } from "./context/UserContext";
import ThinkingLoader from "./components/ThinkingLoader";

// דפים קיימים
import SitesPage from "./pages/SitesPage";
import TactiSitesPage from "./pages/TactiSitesPage";
import PhonesPage from "./pages/PhonesPage";
import AdminPage from "./pages/AdminPage";
import GroupSettingsPage from "./pages/GroupSettingsPage";
import ShiftSchedulePage from "./pages/ShiftSchedulePage";
import ShiftReportPage from "./pages/ShiftReportPage";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isRestoringSession } = useUser();

    // 1. המתנה לטעינת נתונים
    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    // 2. אם אין משתמש -> לוגין
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. הגנה חדשה: אם זה משתמש "אורח" (ללא קבוצות)
    // אנחנו מונעים ממנו לראות דפים פנימיים
    if (user.groups.length === 0) {
        return <Navigate to="/guest" replace />;
    }

    return <>{children}</>;
};

function App() {
    const { user } = useUser();

    // בדיקה האם להציג את ה-Navbar (לא מציגים בלוגין, לא ב-Callback, ולא ב-Guest)
    const showNavbar = user && user.groups.length > 0;

    return (
        <Router>
            {showNavbar && <Navbar />}
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                {/* נתיב החזרה מה-SSO */}
                <Route path="/auth/callback" element={<SSOCallback />} />

                {/* דף המתנה למשתמשים ללא הרשאות */}
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
