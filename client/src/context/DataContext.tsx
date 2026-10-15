/**
 * @module DataContext
 *
 * Provides a global state management for core application data entities.
 * Synchronizes sites, phones, users, and groups from the backend to ensure
 * data consistency across different pages and components, enforcing group-scoped
 * user queries for standard users and full directory access for administrators.
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useMemo,
    useRef,
    type ReactNode,
} from "react";
import { getSites } from "../api/sitesApi";
import { getPhones } from "../api/phonesApi";
import { getGroups } from "../api/groupsApi";
import { getUsers } from "../api/usersApi";
import { isRateLimitError, rateLimitMessage } from "../api/apiClient";
import { useUser } from "./UserContext";
import type { SiteCard, PhoneRow, User, Group } from "../types";

/** Why the app could not load the data it needs (groups or users) on its first load. */
export interface DataLoadError {
    /** HTTP status, when the server answered (e.g. 429, 503); absent for network failures. */
    readonly status?: number;
    /** A user-facing explanation, including when to retry for a rate limit. */
    readonly message: string;
}

/** Turns a failed groups/users request into a message the app shell can show. */
const describeLoadError = (reason: unknown): DataLoadError => {
    if (isRateLimitError(reason)) {
        return { status: 429, message: rateLimitMessage(reason) };
    }
    const status = (reason as { response?: { status?: number } } | null)?.response?.status;
    if (typeof status === "number" && status >= 500) {
        return { status, message: "The server is unavailable right now." };
    }
    if (typeof status === "number") {
        return { status, message: `The server refused the request (${status}).` };
    }
    return { message: "The server could not be reached." };
};

/**
 * Defines the structure of the data context state and its management functions.
 */
interface DataContextType {
    /** Collection of all sites available in the system. */
    sites: SiteCard[];
    /** Direct state setter for sites, used for optimistic updates. */
    setSites: React.Dispatch<React.SetStateAction<SiteCard[]>>;
    /** Collection of all registered phone records. */
    phones: PhoneRow[];
    /** Direct state setter for phones. */
    setPhones: React.Dispatch<React.SetStateAction<PhoneRow[]>>;
    /** List of users (scoped to active group for regular users; full directory for administrators). */
    users: User[];
    /** Direct state setter for users. */
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    /** List of user groups/departments accessible to the authenticated user. */
    groups: Group[];
    /** Direct state setter for groups. */
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    /** Indicates if a background data fetch is currently in progress. */
    loading: boolean;
    /** Triggers a full re-fetch of all data entities from the API. */
    refreshData: () => Promise<void> | void;
    /**
     * Set when groups or users could not be loaded (on the first load, or on a retry after such a
     * failure). The app shell shows it full-page instead of an empty app. Nothing retries
     * automatically; `retry` does it on request.
     */
    loadError: DataLoadError | null;
    /** Loads everything again after a load error. */
    retry: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

/**
 * Lists the ids and names of every group the user belongs to, used to check a stored group selection.
 */
const memberGroupKeys = (user: User | null): string[] =>
    (user?.groups ?? []).flatMap((membership) =>
        [membership.groupId, membership.groupName].filter((key): key is string => Boolean(key)),
    );

/**
 * Context provider that handles data synchronization and state distribution.
 * 
 * Scopes user entities according to the active user's role and selected group:
 * - Administrators receive the full user directory for administrative operations.
 * - Regular users receive only members belonging to their currently active group.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The provider component wrapping its children.
 */
export const DataProvider = ({ children }: { children: ReactNode }) => {
    const { user, currentGroup, setCurrentGroup, isAdmin, isRestoringSession } =
        useUser();

    const [sites, setSites] = useState<SiteCard[]>([]);
    const [phones, setPhones] = useState<PhoneRow[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<DataLoadError | null>(null);
    const loadErrorRef = useRef<DataLoadError | null>(null);

    const isFetchingRef = useRef(false);
    const pendingFetchRef = useRef(false);
    const lastLoadedGroupIdRef = useRef<string | null>(null);
    const lastFetchedUserIdRef = useRef<string | null>(null);
    const hasLoadedRef = useRef(false);

    // Keep refs of dynamic context values to maintain stable callback identities
    const userRef = useRef(user);
    const currentGroupRef = useRef(currentGroup);
    const isAdminRef = useRef(isAdmin);

    useEffect(() => {
        userRef.current = user;
        currentGroupRef.current = currentGroup;
        isAdminRef.current = isAdmin;
    }, [user, currentGroup, isAdmin]);

    /**
     * Fetches core application entities from the backend.
     * Enforces group scoping on user data queries for regular users while parallelizing all network requests.
     */
    const fetchData = useCallback(async () => {
        const storedUserId = localStorage.getItem("hunting_userId");

        // Rely on httpOnly cookies; requires active user or storedUserId
        if (!userRef.current && !storedUserId) {
            setLoading(false);
            return;
        }

        if (isFetchingRef.current) {
            pendingFetchRef.current = true;
            return;
        }
        isFetchingRef.current = true;

        // A load that must succeed for the app to work: the first one, or a retry after it failed
        const isBlockingLoad = !hasLoadedRef.current || loadErrorRef.current !== null;

        try {
            // Only the first load blocks the whole app. Background refreshes keep the current page
            // mounted, so an open dialog and the page's state survive a save.
            if (isBlockingLoad) {
                setLoading(true);
            }

            const currentUser = userRef.current;
            const storedGroupId = localStorage.getItem("hunting_groupId");
            // A stored group is trusted only if the user belongs to it (administrators may open any group)
            const memberKeys = memberGroupKeys(currentUser);
            const validStoredGroupId = storedGroupId && (isAdminRef.current || memberKeys.includes(storedGroupId))
                ? storedGroupId
                : undefined;
            const firstRawGid = currentUser?.groups?.[0]?.groupId;
            const fallbackGid = typeof firstRawGid === "object" && firstRawGid !== null
                ? (firstRawGid as { _id?: string; name?: string })._id || (firstRawGid as { _id?: string; name?: string }).name
                : firstRawGid ? String(firstRawGid) : undefined;
            const activeGroupIdToFetch = validStoredGroupId || fallbackGid;

            // Determine if users should be fetched in parallel with other entities
            const usersPromise = isAdminRef.current
                ? getUsers()
                : (activeGroupIdToFetch ? getUsers(activeGroupIdToFetch) : Promise.resolve({ data: [] as User[] }));

            // Fetch sites, phones, groups, and scoped users simultaneously in parallel
            // Settle each request on its own: one failing call (for example a 403 on the scoped
            // user list) must not drop the other entities from the view.
            const [sitesResult, phonesResult, groupsResult, usersResult] = await Promise.allSettled([
                getSites(),
                getPhones(),
                getGroups(),
                usersPromise,
            ]);

            if (sitesResult.status === "fulfilled") {
                setSites(sitesResult.value?.data || []);
            } else {
                console.error("Error fetching sites:", sitesResult.reason);
            }
            if (phonesResult.status === "fulfilled") {
                setPhones(phonesResult.value?.data || []);
            } else {
                console.error("Error fetching phones:", phonesResult.reason);
            }
            const fetchedGroups: Group[] = groupsResult.status === "fulfilled" ? groupsResult.value?.data || [] : [];
            if (groupsResult.status === "fulfilled") {
                setGroups(fetchedGroups);
            } else {
                console.error("Error fetching groups:", groupsResult.reason);
            }
            const initialUsers = usersResult.status === "fulfilled" ? usersResult.value?.data : undefined;
            if (initialUsers) {
                setUsers(initialUsers);
            } else if (usersResult.status === "rejected") {
                console.error("Error fetching users:", usersResult.reason);
            }

            // Without groups or users the app has nothing to show: say why instead of an empty UI.
            // A background refresh that fails keeps the data already on screen.
            if (isBlockingLoad) {
                const failure = [groupsResult, usersResult].find((r) => r.status === "rejected");
                const nextError = failure && failure.status === "rejected" ? describeLoadError(failure.reason) : null;
                loadErrorRef.current = nextError;
                setLoadError(nextError);
                if (nextError) {
                    return;
                }
            }

            // Synchronize and resolve full Group object in UserContext
            let targetGroup: Group | undefined;

            if (currentGroupRef.current?._id) {
                targetGroup = fetchedGroups.find(
                    (g) => g._id === currentGroupRef.current?._id,
                );
            }

            if (!targetGroup && validStoredGroupId) {
                targetGroup = fetchedGroups.find(
                    (g) => g._id === validStoredGroupId || g.name === validStoredGroupId,
                );
            }

            const latestUser = userRef.current;
            if (!targetGroup && latestUser?.groups && latestUser.groups.length > 0) {
                const rawGid = latestUser.groups[0].groupId;
                const firstGid = typeof rawGid === "object" && rawGid !== null
                    ? (rawGid as { _id?: string; name?: string })._id || (rawGid as { _id?: string; name?: string }).name
                    : String(rawGid);
                targetGroup = fetchedGroups.find(
                    (g) => g._id === firstGid || g.name === firstGid,
                );
            }

            if (targetGroup) {
                setCurrentGroup(targetGroup);
                if (targetGroup._id) {
                    localStorage.setItem("hunting_groupId", targetGroup._id);
                }
            }

            // If non-admin and initial users were empty, but targetGroup was resolved now, fetch scoped users
            if (
                !isAdminRef.current &&
                (!initialUsers || initialUsers.length === 0) &&
                targetGroup?._id
            ) {
                try {
                    const scopedRes = await getUsers(targetGroup._id);
                    if (scopedRes?.data) {
                        setUsers(scopedRes.data);
                    }
                } catch (err) {
                    console.error("Error fetching users for resolved group:", err);
                }
            }

            const activeGroupId = targetGroup?._id || validStoredGroupId || activeGroupIdToFetch;
            lastLoadedGroupIdRef.current = isAdminRef.current ? "admin" : (activeGroupId || null);
            lastFetchedUserIdRef.current = userRef.current?._id || currentUser?._id || null;
        } catch (error: unknown) {
            console.error("Error fetching data:", error);
        } finally {
            hasLoadedRef.current = true;
            setLoading(false);
            isFetchingRef.current = false;
            if (pendingFetchRef.current) {
                pendingFetchRef.current = false;
                fetchData();
            }
        }
    }, [setCurrentGroup]);

    // Initial data fetch upon mount or authentication state update
    useEffect(() => {
        // Wait until session restoration finishes so user and groups are properly identified
        if (isRestoringSession) {
            return;
        }

        if (user) {
            if (lastFetchedUserIdRef.current !== user._id) {
                fetchData();
            }
        } else if (!user) {
            lastFetchedUserIdRef.current = null;
            lastLoadedGroupIdRef.current = null;
            loadErrorRef.current = null;
            setLoadError(null);
            setSites([]);
            setPhones([]);
            setGroups([]);
            setUsers([]);
            setLoading(false);
        }
    }, [user, isRestoringSession, fetchData]);

    // Dynamically update users when the active group or admin role switches
    useEffect(() => {
        let isCurrent = true;
        const activeGroupId = currentGroup?._id;
        if (!user || isRestoringSession || !activeGroupId) return;

        const currentKey = isAdmin ? "admin" : activeGroupId;
        // Skip if this scope was already loaded during the initial fetchData or previous switch
        if (lastLoadedGroupIdRef.current === currentKey) return;

        const fetchScopedUsers = async () => {
            try {
                if (isAdmin) {
                    const usersRes = await getUsers();
                    if (!isCurrent) return;
                    setUsers(usersRes?.data || []);
                } else {
                    const usersRes = await getUsers(activeGroupId);
                    if (!isCurrent) return;
                    setUsers(usersRes?.data || []);
                }
                if (isCurrent) {
                    lastLoadedGroupIdRef.current = currentKey;
                }
            } catch (error: unknown) {
                if (isCurrent) {
                    console.error("Error fetching scoped users for group:", error);
                }
            }
        };

        fetchScopedUsers();
        return () => {
            isCurrent = false;
        };
    }, [currentGroup?._id, user, isAdmin, isRestoringSession]);

    const retry = useCallback(() => {
        void fetchData();
    }, [fetchData]);

    const contextValue = useMemo<DataContextType>(
        () => ({
            sites,
            setSites,
            phones,
            setPhones,
            users,
            setUsers,
            groups,
            setGroups,
            loading,
            refreshData: fetchData,
            loadError,
            retry,
        }),
        [sites, phones, users, groups, loading, fetchData, loadError, retry],
    );

    return (
        <DataContext.Provider value={contextValue}>
            {children}
        </DataContext.Provider>
    );
};

/**
 * Custom hook to access the data context.
 * 
 * Must be used within a DataProvider tree. Provides access to all
 * globally managed entities and the loading status.
 *
 * @returns {DataContextType} The current data context value.
 * @throws {Error} If called outside of a DataProvider.
 */
export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
};

