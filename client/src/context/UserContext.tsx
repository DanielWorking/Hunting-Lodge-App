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
    useCallback,
    useRef,
    type ReactNode,
    useEffect,
} from "react";
import axios from "axios";
import { getMe } from "../api/authApi";
import { loginUser } from "../api/usersApi";
import type { User, Group, GroupRole } from "../types";
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
     * @param {Group} [targetGroup] - Optional pre-resolved Group object.
     */
    switchGroup: (groupId: string, targetGroup?: Group) => void;
    /** Indicates if the system is still trying to recover a previous session from storage. */
    isRestoringSession: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

interface RawGroupObject {
    _id?: string;
    name?: string;
}

interface RawUserGroup {
    groupId: string | RawGroupObject;
    role: GroupRole;
    name?: string;
    groupName?: string;
    order?: number;
}

interface RawUserData {
    _id: string;
    id?: string;
    username: string;
    displayName?: string;
    email?: string;
    groups?: RawUserGroup[];
    isActive: boolean;
    vacationBalance: number;
    favoritePhones?: string[];
    createdAt?: string;
    updatedAt?: string;
    lastLogin?: string;
}

const normalizeUser = (foundUser: RawUserData): User => {
    return {
        ...foundUser,
        groups: (foundUser.groups || []).map((g) => {
            const rawGid = g.groupId;
            let gidString: string;
            let groupName: string | undefined = g.name || g.groupName;

            if (typeof rawGid === "object" && rawGid !== null) {
                gidString = rawGid._id || rawGid.name || "";
                if (rawGid.name) {
                    groupName = rawGid.name;
                }
            } else {
                gidString = String(rawGid);
            }

            return {
                ...g,
                groupId: gidString,
                ...(groupName ? { groupName } : {}),
            };
        }),
    };
};

/**
 * Provider component that handles the authentication lifecycle.
 * 
 * Manages session persistence via localStorage and token verification,
 * and calculates permissions (isAdmin, isShiftManager) based on active group context.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The authentication provider component.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
    const [isRestoringSession, setIsRestoringSession] = useState(true);
    const isRestoringRef = useRef(false);

    /**
     * Determines whether the user account possesses global administrative eligibility.
     * True if the user is the designated root Super Admin or is assigned to the administrator group.
     */
    const isUserAdminEligible = Boolean(
        user?.username === envConfig.superAdmin.id ||
        (currentGroup &&
            currentGroup.name === envConfig.superAdmin.groupName &&
            user?.groups?.some((g) => {
                return (
                    g.groupId === currentGroup._id ||
                    g.groupId === currentGroup.name ||
                    g.groupId === envConfig.superAdmin.groupName ||
                    g.groupName === currentGroup.name ||
                    g.name === currentGroup.name
                );
            })) ||
        user?.groups?.some((g) => {
            const gName = g.name || g.groupName;
            return (
                g.groupId === envConfig.superAdmin.groupName ||
                gName === envConfig.superAdmin.groupName
            );
        }),
    );

    /**
     * Determines if the active group is the system administrator group.
     */
    const isActiveAdminGroup = Boolean(
        currentGroup
            ? currentGroup.name === envConfig.superAdmin.groupName
            : false,
    );

    /**
     * User has administrator privileges ONLY when actively connected to the administrator group.
     * When switching to any other group, permissions downgrade to that group's assigned role.
     */
    const isAdmin = Boolean(isUserAdminEligible && isActiveAdminGroup);

    /** 
     * Checks if the user has managerial privileges within the active group context.
     * Uses optional chaining to prevent runtime errors during session transitions.
     */
    const activeGroupId = currentGroup?._id || localStorage.getItem("hunting_groupId");
    const isShiftManagerBool = Boolean(
        user?.groups?.some((g) => {
            const gName = g.name || g.groupName;
            return (
                (g.groupId === activeGroupId || gName === activeGroupId) &&
                g.role === "shift_manager"
            );
        }),
    );

    /**
     * Terminates the session and cleans up sensitive items from localStorage.
     */
    const logout = useCallback(() => {
        setUser(null);
        setCurrentGroup(null);
        localStorage.removeItem("hunting_token");
        localStorage.removeItem("hunting_userId");
        localStorage.removeItem("hunting_groupId");
    }, []);

    /**
     * Session Restoration logic.
     * 
     * Runs on initial mount. Validates stored JWT against the `/api/auth/me` endpoint
     * to safely reconstruct the user session without querying the global user directory.
     * 
     * Only invokes logout() if the server explicitly responds with HTTP 401 Unauthorized
     * (indicating an invalid or expired token). Transient network disruptions, timeouts,
     * or 5xx server errors preserve stored credentials to allow recovery upon reconnection.
     */
    useEffect(() => {
        const restoreSession = async () => {
            const storedToken = localStorage.getItem("hunting_token");
            const storedUserId = localStorage.getItem("hunting_userId");

            if (!storedToken || !storedUserId) {
                setIsRestoringSession(false);
                return;
            }

            if (isRestoringRef.current) return;
            isRestoringRef.current = true;

            try {
                const response = await getMe();
                const foundUser = response.data as RawUserData;

                if (foundUser) {
                    const safeUser = normalizeUser(foundUser);
                    setUser(safeUser);
                } else {
                    logout();
                }
            } catch (error: unknown) {
                console.error("Session restoration failed:", error);
                // Only clear the stored session if the backend explicitly rejected the token (401)
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    logout();
                }
            } finally {
                setIsRestoringSession(false);
                isRestoringRef.current = false;
            }
        };

        restoreSession();
    }, [logout]);

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
                const safeUser = normalizeUser(foundUser);

                setUser(safeUser);

                if (token) {
                    localStorage.setItem("hunting_token", token);
                }
                localStorage.setItem("hunting_userId", safeUser._id);

                if (safeUser.groups.length > 0) {
                    localStorage.setItem("hunting_groupId", safeUser.groups[0].groupId);
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
     * Switches the current active group scope if the user has permission.
     *
     * @param {string} groupId - The target group identifier.
     * @param {Group} [targetGroup] - Optional pre-resolved group object.
     */
    const switchGroup = (groupId: string, targetGroup?: Group) => {
        const membership = user?.groups?.find((g) => {
            return (
                g.groupId === groupId ||
                g.groupName === groupId ||
                g.name === groupId
            );
        });
        if (membership || isUserAdminEligible) {
            localStorage.setItem("hunting_groupId", groupId);
            if (targetGroup) {
                setCurrentGroup(targetGroup);
            } else {
                setCurrentGroup((prev) => {
                    if (prev && prev._id === groupId) return prev;
                    return {
                        _id: groupId,
                        name: groupId,
                        members: [],
                        createdAt: new Date().toISOString(),
                    } as Group;
                });
            }
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

