/**
 * @module UserContext
 *
 * Manages user authentication, session restoration, and current group scope.
 * Restores the SSO session, handles logout, and provides reactive state for the
 * authenticated user's permissions and active organizational group.
 */

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useMemo,
    useRef,
    type ReactNode,
    useEffect,
} from "react";
import axios from "axios";
import { getMe, logoutUser } from "../api/authApi";
import type { User, Group, GroupRole } from "../types";

/**
 * Defines the structure of the authentication and authorization context.
 */
interface UserContextType {
    /** The currently authenticated user object, or null if unauthenticated. */
    user: User | null;
    /** True if a valid authenticated user session is active. */
    isAuthenticated?: boolean;
    /** The specific group/department the user is currently interacting with. */
    currentGroup: Group | null;
    /** Direct state setter for currentGroup. */
    setCurrentGroup: React.Dispatch<React.SetStateAction<Group | null>>;
    /** True if the user is currently acting with administrator privileges. */
    isAdmin: boolean;
    /** True if the user has a 'shift_manager' role in the current group. */
    isShiftManager: boolean;
    /** Clears the session and redirects to the login state. */
    logout: () => void | Promise<void>;
    /**
     * Changes the active group scope for the user.
     * 
     * @param {string} groupId - The ID of the group to switch to.
     * @param {Group} [targetGroup] - Optional pre-resolved Group object.
     */
    switchGroup: (groupId: string, targetGroup?: Group) => void;
    /** Indicates if the system is still trying to recover a previous session from storage. */
    isRestoringSession: boolean;
    /** Updates local state to mark that the user has acknowledged the What's New modal. */
    markWhatsNewSeen?: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

/** A populated membership group (GET /auth/me populates `groupId` with the group document). */
interface RawGroupObject {
    _id: string;
    name?: string;
}

interface RawUserGroup {
    /** Null when the group no longer exists (a populated reference to a deleted group). */
    groupId: string | RawGroupObject | null;
    role: GroupRole;
    order?: number;
    isSystemGroup?: boolean;
}

interface RawUserData {
    _id: string;
    username: string;
    displayName?: string;
    email?: string;
    groups?: RawUserGroup[];
    isActive: boolean;
    favoritePhones?: string[];
    createdAt?: string;
    updatedAt?: string;
    lastLogin?: string;
    hasSeenWhatsNew?: boolean;
    isSuperAdmin?: boolean;
    isAdmin?: boolean;
}

const normalizeUser = (foundUser: RawUserData): User => {
    return {
        ...foundUser,
        isSuperAdmin: Boolean(foundUser.isSuperAdmin),
        isAdmin: Boolean(foundUser.isAdmin),
        hasSeenWhatsNew: foundUser.hasSeenWhatsNew ?? false,
        groups: (foundUser.groups || []).flatMap((g) => {
            const rawGid = g.groupId;
            const isPopulated = typeof rawGid === "object" && rawGid !== null;
            const groupId = isPopulated ? rawGid._id : rawGid;
            // A membership without a group names nothing to open (never send it as the id "null")
            if (!groupId) {
                return [];
            }
            // The group's name is only for display; memberships are always matched by id
            const groupName = isPopulated ? rawGid.name : undefined;

            return [{
                ...g,
                groupId,
                ...(groupName ? { groupName } : {}),
                isSystemGroup: Boolean(g.isSystemGroup),
            }];
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
     * True if the user has isSuperAdmin or isAdmin flags returned by the server.
     */
    const isUserAdminEligible = Boolean(user?.isSuperAdmin || user?.isAdmin);

    /** 
     * Checks if the user has managerial privileges within the active group context.
     * Uses optional chaining to prevent runtime errors during session transitions.
     */
    const activeGroupId = currentGroup?._id || localStorage.getItem("hunting_groupId");

    const activeGroupMembership = user?.groups?.find((g) => g.groupId === activeGroupId) || user?.groups?.[0];

    /**
     * Determines if the active group is the system administrator group.
     * Checks currentGroup if set; falls back to active membership during session initialization.
     */
    const isActiveAdminGroup = currentGroup
        ? Boolean(currentGroup.isSystemGroup)
        : Boolean(activeGroupMembership?.isSystemGroup);

    /**
     * User has administrator privileges ONLY when actively connected to the administrator group.
     * When switching to any other group, permissions downgrade to that group's assigned role.
     */
    const isAdmin = Boolean(isUserAdminEligible && isActiveAdminGroup);

    const isShiftManagerBool = Boolean(
        user?.groups?.some((g) => g.groupId === activeGroupId && g.role === "shift_manager"),
    );

    /**
     * Terminates the session, invalidates cookies via backend logout endpoint,
     * and cleans up sensitive items from localStorage.
     */
    const logout = useCallback(async (): Promise<void> => {
        try {
            await logoutUser();
        } catch (error) {
            console.error("Backend logout failed:", error);
        } finally {
            setUser(null);
            setCurrentGroup(null);
            localStorage.removeItem("hunting_userId");
            localStorage.removeItem("hunting_groupId");
        }
    }, []);

    /**
     * Session Restoration logic.
     *
     * Runs on initial mount. Validates session against `/api/auth/me` endpoint
     * using the httpOnly session cookie to safely reconstruct user state.
     *
     * Only invokes logout() if the server explicitly responds with HTTP 401 Unauthorized
     * (indicating an invalid or expired token). Transient network disruptions, timeouts,
     * or 5xx server errors preserve stored credentials to allow recovery upon reconnection.
     */
    useEffect(() => {
        const restoreSession = async () => {
            if (isRestoringRef.current) return;
            isRestoringRef.current = true;

            try {
                const response = await getMe();
                const foundUser = response.data as RawUserData;

                if (foundUser) {
                    const safeUser = normalizeUser(foundUser);
                    setUser(safeUser);
                    if (safeUser._id) {
                        localStorage.setItem("hunting_userId", safeUser._id);
                    }
                } else {
                    await logout();
                }
            } catch (error: unknown) {
                // If backend explicitly rejected the session (401), clean up local state quietly
                if (axios.isAxiosError(error) && error.response?.status === 401) {
                    setUser(null);
                    setCurrentGroup(null);
                    localStorage.removeItem("hunting_userId");
                    localStorage.removeItem("hunting_groupId");
                } else {
                    console.error("Session restoration failed:", error);
                }
            } finally {
                setIsRestoringSession(false);
                isRestoringRef.current = false;
            }
        };

        restoreSession();
    }, [logout]);

    /**
     * Switches the current active group scope if the user has permission.
     *
     * @param {string} groupId - The target group identifier.
     * @param {Group} [targetGroup] - Optional pre-resolved group object.
     */
    const switchGroup = useCallback((groupId: string, targetGroup?: Group) => {
        const membership = user?.groups?.find((g) => g.groupId === groupId);
        if (membership || isUserAdminEligible) {
            localStorage.setItem("hunting_groupId", groupId);
            if (targetGroup) {
                setCurrentGroup({
                    ...targetGroup,
                    isSystemGroup: targetGroup.isSystemGroup ?? Boolean(membership?.isSystemGroup),
                });
            } else {
                const resolvedName = membership?.groupName || groupId;
                setCurrentGroup((prev) => {
                    if (prev && prev._id === groupId && prev.name === resolvedName) return prev;
                    return {
                        _id: groupId,
                        name: resolvedName,
                        members: [],
                        isSystemGroup: Boolean(membership?.isSystemGroup),
                        createdAt: new Date().toISOString(),
                    } as Group;
                });
            }
        }
    }, [user, isUserAdminEligible]);

    const isAuthenticated = Boolean(user && user.isActive !== false);

    const markWhatsNewSeen = useCallback(() => {
        setUser((prev) => (prev ? { ...prev, hasSeenWhatsNew: true } : null));
    }, []);

    const contextValue = useMemo(() => ({
        user,
        isAuthenticated,
        currentGroup,
        setCurrentGroup,
        isAdmin,
        isShiftManager: isShiftManagerBool,
        logout,
        switchGroup,
        isRestoringSession,
        markWhatsNewSeen,
    }), [
        user,
        isAuthenticated,
        currentGroup,
        isAdmin,
        isShiftManagerBool,
        logout,
        switchGroup,
        isRestoringSession,
        markWhatsNewSeen,
    ]);

    return (
        <UserContext.Provider value={contextValue}>
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

