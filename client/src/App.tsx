import React from "react";
import {
    BrowserRouter as Router,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import { Container, Paper, Typography, Button, Box } from "@mui/material"; // MUI Imports
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

// === מסך המתנה למשתמשים ללא קבוצה (Guest) ===
const PendingApprovalScreen = () => {
    const { user, logout } = useUser();

    return (
        <Container maxWidth="sm" sx={{ mt: 10 }}>
            <Paper
                elevation={3}
                sx={{ p: 5, textAlign: "center", borderRadius: 2 }}
            >
                <Typography variant="h4" gutterBottom color="warning.main">
                    חשבון בהמתנה
                </Typography>
                <Typography variant="body1" paragraph>
                    שלום <strong>{user?.name}</strong>,
                </Typography>
                <Typography variant="body1" paragraph>
                    הפרטים שלך נקלטו במערכת בהצלחה, אך המשתמש שלך טרם שויך
                    לקבוצת עבודה.
                    <br />
                    אנא פנה למנהל המערכת או לראש הצוות שלך כדי שיאשרו את הגישה.
                </Typography>
                <Box sx={{ mt: 4 }}>
                    <Button variant="outlined" color="primary" onClick={logout}>
                        התנתק וחזור לדף הבית
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
};

// === רכיב הגנה משופר ===
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user, isRestoringSession } = useUser();

    // 1. טעינה ראשונית - בודקים מול השרת
    if (isRestoringSession) {
        return <ThinkingLoader />;
    }

    // 2. לא מחובר -> לוגין
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // 3. מחובר אבל בתפקיד אורח (ללא קבוצה) -> מסך המתנה
    // התיקון: בדיקה פשוטה אם התפקיד הוא guest. (אין צורך לבדוק שהוא לא אדמין, כי guest הוא בהגדרה לא אדמין)
    if (user.role === "guest") {
        return <PendingApprovalScreen />;
    }

    return <>{children}</>;
};

function App() {
    const { user } = useUser();

    // בדיקה האם להציג את ה-Navbar (לא מציגים בלוגין, לא ב-Callback, ולא ב-Guest)
    const showNavbar = user && user.groups.length > 0;

    return (
        <Router>
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                {/* כל הנתיבים המוגנים עטופים ב-Layout עם Navbar */}
                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
                                <Navbar />
                                <main className="container mx-auto px-4 py-8">
                                    <Routes>
                                        <Route
                                            path="/"
                                            element={<SitesPage />}
                                        />
                                        <Route
                                            path="/tacti-sites"
                                            element={<TactiSitesPage />}
                                        />
                                        <Route
                                            path="/phones"
                                            element={<PhonesPage />}
                                        />
                                        <Route
                                            path="/group-settings"
                                            element={<GroupSettingsPage />}
                                        />
                                        <Route
                                            path="/schedule"
                                            element={<ShiftSchedulePage />}
                                        />
                                        <Route
                                            path="/reports"
                                            element={<ShiftReportPage />}
                                        />
                                        <Route
                                            path="/admin/users"
                                            element={<AdminPage />}
                                        />
                                    </Routes>
                                </main>
                            </div>
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </Router>
    );
}

export default App;
