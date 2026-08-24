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
import { getMe } from "../api/authApi";
import { loginUser } from "../api/usersApi";
import type { User, Group } from "../types";
import envConfig from "../config/env";

/**
 * Defines the structure of the authentication and authorization context.
 */
interface UserContextType {
    /** The currently authenticated user object, or null if unauthenticated. */
    user: User | null;
    /** The specific group/department the user is currently interacting with. */
    currentGroup: Group | null;
    /** Direct state setter for currentGroup. */
    setCurrentGroup: React.Dispatch<React.SetStateAction<Group | null>>;
    /** True if the user is in the system-wide super administrator group. */
    isAdmin: boolean;
    /** True if the user has a 'shift_manager' role in the current group. */
    isShiftManager: boolean;
    /**
     * Performs authentication against the backend.
     * 
     * @param {string} username - The identifier for the user.
     * @param {string} [password] - The user's password (optional).
     * @returns {Promise<boolean>} True if login was successful.
     */
    login: (username: string, password?: string) => Promise<boolean>;
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
 * Manages session persistence via localStorage and token verification,
 * and calculates permissions (isAdmin, isShiftManager) based on user roles.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The authentication provider component.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
    const [isRestoringSession, setIsRestoringSession] = useState(true);

    /**
     * Calculates if the user possesses administrator privileges.
     * Matches either the active group name, user's group assignments, or root super admin identity.
     */
    const isAdmin = Boolean(
        currentGroup?.name === envConfig.superAdmin.groupName ||
        user?.groups?.some((g) => g.groupId === envConfig.superAdmin.groupName) ||
        user?.username === envConfig.superAdmin.id,
    );

    /** 
     * Checks if the user has managerial privileges within the active group context.
     * Uses optional chaining to prevent runtime errors during session transitions.
     */
    const isShiftManagerBool = Boolean(
        user?.groups?.some(
            (g) =>
                (g.groupId === (currentGroup?._id || currentGroup?.id) ||
                 g.groupId === localStorage.getItem("hunting_groupId")) &&
                g.role === "shift_manager",
        ),
    );

    /**
     * Session Restoration logic.
     * 
     * Runs on initial mount. Validates stored JWT against the `/api/auth/me` endpoint
     * to safely reconstruct the user session without querying the global user directory.
     */
    useEffect(() => {
        const restoreSession = async () => {
            const storedToken = localStorage.getItem("hunting_token");
            const storedUserId = localStorage.getItem("hunting_userId");

            if (!storedToken || !storedUserId) {
                setIsRestoringSession(false);
                return;
            }

            try {
                const response = await getMe();
                const foundUser = response.data;

                if (foundUser && foundUser.isActive !== false) {
                    const safeUser: User = {
                        ...foundUser,
                        groups: foundUser.groups || [],
                    };
                    setUser(safeUser);
                } else {
                    logout();
                }
            } catch (error) {
                console.error("Session restoration failed:", error);
                logout();
            } finally {
                setIsRestoringSession(false);
            }
        };

        restoreSession();
    }, []);

    /**
     * Authenticates the user and initializes the session.
     *
     * @param {string} username - User login identifier.
     * @param {string} [_pass] - Optional password (currently bypassed).
     * @returns {Promise<boolean>} True if authentication succeeded.
     */
    const login = async (username: string, _pass?: string): Promise<boolean> => {
        try {
            const response = await loginUser(username);
            const data = response.data;
            const foundUser = data.user || data;
            const token = data.token;

            if (foundUser) {
                const safeUser: User = {
                    ...foundUser,
                    groups: foundUser.groups || [],
                };

                setUser(safeUser);

                if (token) {
                    localStorage.setItem("hunting_token", token);
                }
                localStorage.setItem(
                    "hunting_userId",
                    safeUser._id || safeUser.id,
                );

                if (safeUser.groups.length > 0) {
                    const firstGroupId = safeUser.groups[0].groupId;
                    localStorage.setItem("hunting_groupId", firstGroupId);
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
        localStorage.removeItem("hunting_token");
        localStorage.removeItem("hunting_userId");
        localStorage.removeItem("hunting_groupId");
    };

    /**
     * Switches the current active group scope if the user has permission.
     *
     * @param {string} groupId - The target group identifier.
     */
    const switchGroup = (groupId: string) => {
        const membership = user?.groups?.find((g) => g.groupId === groupId);
        if (membership || isAdmin) {
            localStorage.setItem("hunting_groupId", groupId);
            setCurrentGroup((prev) => {
                if (prev && (prev._id === groupId || prev.id === groupId)) return prev;
                return {
                    id: groupId,
                    name: prev?.name || groupId,
                    members: [],
                    createdAt: new Date().toISOString(),
                } as Group;
            });
        }
    };

    return (
        <UserContext.Provider
            value={{
                user,
                currentGroup,
                setCurrentGroup,
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

