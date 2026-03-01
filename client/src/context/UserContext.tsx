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
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    switchGroup: (groupId: string) => void;
    isRestoringSession: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const { users, groups, refreshData, loading: dataLoading } = useData();

    const [user, setUser] = useState<User | null>(null);
    const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    const isAdmin = currentGroup?.name?.toLowerCase() === "administrators";

    // שימוש בסימני שאלה כדי למנוע קריסה פנימית בקומפוננטה
    const isShiftManagerBool =
        user?.groups?.some(
            (g) =>
                g.groupId === (currentGroup?._id || currentGroup?.id) &&
                g.role === "shift_manager",
        ) || false;

    // === שחזור סשן ===
    useEffect(() => {
        if (dataLoading) return;

        const restoreSession = () => {
            const storedUserId = localStorage.getItem("hunting_userId");
            const storedGroupId = localStorage.getItem("hunting_groupId");

            if (storedUserId) {
                const foundUser = users.find(
                    (u) => (u._id || u.id) === storedUserId,
                );

                if (foundUser) {
                    // תיקון קריטי: מוודאים ש-groups תמיד קיים כמערך
                    // זה מונע קריסות בקבצים חיצוניים כמו App.tsx שמצפים למערך
                    const safeUser: User = {
                        ...foundUser,
                        groups: foundUser.groups || [],
                    };

                    setUser(safeUser);

                    if (storedGroupId) {
                        const foundGroup = groups.find(
                            (g) => (g._id || g.id) === storedGroupId,
                        );
                        if (foundGroup) {
                            setCurrentGroup(foundGroup);
                        } else {
                            selectDefaultGroup(safeUser);
                        }
                    } else {
                        selectDefaultGroup(safeUser);
                    }
                } else {
                    logout();
                }
            }
            setIsRestoringSession(false);
        };

        restoreSession();
    }, [users, groups, dataLoading]);

    const selectDefaultGroup = (u: User) => {
        if (u.groups && u.groups.length > 0) {
            const firstGroupId = u.groups[0].groupId;
            const groupObj = groups.find(
                (g) => (g._id || g.id) === firstGroupId,
            );
            if (groupObj) setCurrentGroup(groupObj);
        }
    };

    const login = async (username: string, _pass: string): Promise<boolean> => {
        try {
            const response = await axios.post("/api/users/login", { username });
            const foundUser = response.data;

            if (foundUser) {
                // תיקון קריטי: גם כאן מוודאים ש-groups הוא מערך תקין
                const safeUser: User = {
                    ...foundUser,
                    groups: foundUser.groups || [],
                };

                setUser(safeUser);

                localStorage.setItem(
                    "hunting_userId",
                    safeUser._id || safeUser.id,
                );

                refreshData();

                if (safeUser.groups.length > 0) {
                    const firstGroupId = safeUser.groups[0].groupId;
                    const groupObj = groups.find(
                        (g) => (g._id || g.id) === firstGroupId,
                    );

                    if (groupObj) {
                        setCurrentGroup(groupObj);
                        localStorage.setItem(
                            "hunting_groupId",
                            groupObj._id || groupObj.id,
                        );
                    }
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error("Login failed:", error);
            return false;
        }
    };

    const logout = () => {
        setUser(null);
        setCurrentGroup(null);
        localStorage.removeItem("hunting_userId");
        localStorage.removeItem("hunting_groupId");
    };

    const switchGroup = (groupId: string) => {
        // שימוש ב-optional chaining להגנה
        const membership = user?.groups?.find((g) => g.groupId === groupId);
        if (membership || isAdmin) {
            const groupObj = groups.find((g) => (g._id || g.id) === groupId);
            if (groupObj) {
                setCurrentGroup(groupObj);
                localStorage.setItem("hunting_groupId", groupId);
            }
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
