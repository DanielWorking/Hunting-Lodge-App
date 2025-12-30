import {
    createContext,
    useContext,
    useState,
    type ReactNode,
    useEffect,
} from "react";
import axios from "axios";
import type { User, Group } from "../types";
import { useData } from "./DataContext";

interface UserContextType {
    user: User | null;
    currentGroup: Group | null;
    isAdmin: boolean;
    isShiftManager: boolean;
    login: () => void; // שונה: לא מקבל פרמטרים
    logout: () => void;
    switchGroup: (groupId: string) => void;
    isRestoringSession: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    // אנו עדיין משתמשים ב-useData כדי לקבל מידע על קבוצות, אך לא לזיהוי המשתמש
    const { groups } = useData();

    const [user, setUser] = useState<User | null>(null);
    const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    // בדיקה: האם המשתמש הוא אדמין (לפי שם הקבוצה הנוכחית או התפקיד ב-User)
    const isAdmin =
        user?.role === "admin" ||
        currentGroup?.name?.toLowerCase() === "administrators";

    // בדיקה אם המשתמש הוא מנהל משמרת בקבוצה הנוכחית
    const isShiftManagerBool =
        user?.groups?.some(
            (g) =>
                g.groupId === (currentGroup?._id || currentGroup?.id) &&
                g.role === "shift_manager"
        ) || false;

    // === בדיקת Session מול השרת בעליית האתר ===
    useEffect(() => {
        const checkAuth = async () => {
            try {
                // פניה לשרת לבדיקת העוגייה
                const { data } = await axios.get("/api/auth/me");

                if (data.user) {
                    setUser(data.user);

                    // אם למשתמש יש כבר קבוצה משויכת, נגדיר אותה כקבוצה הנוכחית
                    if (data.user.group) {
                        // כאן אנו מניחים שהשרת מחזיר את ה-ID של הקבוצה
                        // או שצריך למצוא את הקבוצה מתוך רשימת הקבוצות ב-Data
                        // לצורך הפשטות ננסה למצוא אותה ב-groups אם נטענו, או נחכה
                        // (בגרסה פשוטה נסמוך על השרת שיחזיר אוכלוס מלא של הקבוצה אם צריך)
                    }
                }
            } catch (error) {
                // 401 או שגיאה אחרת אומרת שאנחנו לא מחוברים
                setUser(null);
            } finally {
                setIsRestoringSession(false);
            }
        };

        checkAuth();
    }, []);

    // עדכון הקבוצה הנוכחית כאשר היוזר או הקבוצות נטענים
    useEffect(() => {
        if (user && user.group && groups.length > 0 && !currentGroup) {
            const foundGroup = groups.find(
                (g) => g._id === user.group || g.id === user.group
            );
            if (foundGroup) {
                setCurrentGroup(foundGroup);
            }
        }
    }, [user, groups, currentGroup]);

    // === התחברות SSO ===
    const login = () => {
        // הפניה לכתובת השרת שמבצעת את תהליך ה-SSO
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
        window.location.href = `${apiUrl}/api/auth/login`;
    };

    // === התנתקות ===
    const logout = async () => {
        try {
            await axios.post("/api/auth/logout");
            setUser(null);
            setCurrentGroup(null);
            // רענון הדף כדי לנקות את כל הזיכרון
            window.location.reload();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const switchGroup = (groupId: string) => {
        // לוגיקה קיימת של החלפת קבוצה (רלוונטי בעיקר לאדמין או משתמש רב-קבוצות)
        const groupObj = groups.find((g) => (g._id || g.id) === groupId);
        if (groupObj) {
            setCurrentGroup(groupObj);
        }
    };

    return (
        <UserContext.Provider
            value={{
                user,
                currentGroup,
                isAdmin,
                isShiftManager: isShiftManagerBool,
                login,
                logout,
                switchGroup,
                isRestoringSession,
            }}
        >
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
