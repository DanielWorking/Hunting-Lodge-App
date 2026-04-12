/**
 * @module UserContext
 *
 * Manages user authentication, session restoration, and current group scope.
 * Handles login/logout operations and provides reactive state for the 
 * authenticated user's permissions and active organizational group.
 */

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

/**
 * Defines the structure of the authentication and authorization context.
 */
interface UserContextType {
    /** The currently authenticated user object, or null if unauthenticated. */
    user: User | null;
    /** The specific group/department the user is currently interacting with. */
    currentGroup: Group | null;
    /** True if the user is in the system-wide super administrator group. */
    isAdmin: boolean;
    /** True if the user has a 'shift_manager' role in the current group. */
    isShiftManager: boolean;
    /**
     * Performs authentication against the backend.
     * 
     * @param {string} username - The identifier for the user.
     * @param {string} password - The user's password (currently ignored by stub).
     * @returns {Promise<boolean>} True if login was successful.
     */
    login: (username: string, password: string) => Promise<boolean>;
    /** Clears the session and redirects to the login state. */
    logout: () => void;
    /**
     * Changes the active group scope for the user.
     * 
     * @param {string} groupId - The ID of the group to switch to.
     */
    switchGroup: (groupId: string) => void;
    /** Indicates if the system is still trying to recover a previous session from storage. */
    isRestoringSession: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

/**
 * Provider component that handles the authentication lifecycle.
 * 
 * It manages session persistence via localStorage and calculates 
 * permissions (isAdmin, isShiftManager) based on the user's data and current group.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The authentication provider component.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
    const { users, groups, refreshData, loading: dataLoading } = useData();

    const [user, setUser] = useState<User | null>(null);
    const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    /** Calculates if the current group name matches the system's super admin group definition. */
    const isAdmin =
        currentGroup?.name === import.meta.env.VITE_SUPER_ADMIN_GROUP_NAME;

    /** 
     * Checks if the user has managerial privileges within the active group context.
     * Uses optional chaining to prevent runtime errors during session transitions.
     */
    const isShiftManagerBool =
        user?.groups?.some(
            (g) =>
                g.groupId === (currentGroup?._id || currentGroup?.id) &&
                g.role === "shift_manager",
        ) || false;

    /**
     * Session Restoration logic.
     * 
     * Runs when data entities (users/groups) are loaded. Attempts to re-hydrate 
     * the user session from localStorage tokens.
     */
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
                    // Normalize user object to ensure groups is always an array,
                    // preventing downstream crashes in components expecting a list.
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

    /**
     * Automatically selects the first available group for a user if no group is specified.
     * 
     * @param {User} u - The user object to select a group for.
     */
    const selectDefaultGroup = (u: User) => {
        if (u.groups && u.groups.length > 0) {
            const firstGroupId = u.groups[0].groupId;
            const groupObj = groups.find(
                (g) => (g._id || g.id) === firstGroupId,
            );
            if (groupObj) setCurrentGroup(groupObj);
        }
    };

    /**
     * Authenticates the user and initializes the session.
     */
    const login = async (username: string, _pass: string): Promise<boolean> => {
        try {
            const response = await axios.post("/api/users/login", { username });
            const foundUser = response.data;

            if (foundUser) {
                // Ensure groups property is a valid array upon login.
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

    /**
     * Terminates the session and cleans up sensitive items from localStorage.
     */
    const logout = () => {
        setUser(null);
        setCurrentGroup(null);
        localStorage.removeItem("hunting_userId");
        localStorage.removeItem("hunting_groupId");
    };

    /**
     * Switches the current active group scope if the user has permission.
     */
    const switchGroup = (groupId: string) => {
        // Protect group switching by verifying membership or super admin status.
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

/**
 * Custom hook to access authentication state and user profile.
 * 
 * @returns {UserContextType} The authentication context value.
 * @throws {Error} If called outside of a UserProvider.
 */
export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUser must be used within a UserProvider");
    }
    return context;
};
