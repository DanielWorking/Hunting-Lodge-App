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
    useRef,
    type ReactNode,
} from "react";
import { getSites } from "../api/sitesApi";
import { getPhones } from "../api/phonesApi";
import { getGroups } from "../api/groupsApi";
import { getUsers } from "../api/usersApi";
import { useUser } from "./UserContext";
import type { SiteCard, PhoneRow, User, Group } from "../types";

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
}

const DataContext = createContext<DataContextType | undefined>(undefined);

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

    const isFetchingRef = useRef(false);
    const lastLoadedGroupIdRef = useRef<string | null>(null);
    const lastFetchedUserIdRef = useRef<string | null>(null);

    // Keep refs of dynamic context values to maintain stable callback identities
    const userRef = useRef(user);
    const currentGroupRef = useRef(currentGroup);
    const isAdminRef = useRef(isAdmin);
    const isRestoringSessionRef = useRef(isRestoringSession);

    useEffect(() => {
        userRef.current = user;
        currentGroupRef.current = currentGroup;
        isAdminRef.current = isAdmin;
        isRestoringSessionRef.current = isRestoringSession;
    }, [user, currentGroup, isAdmin, isRestoringSession]);

    /**
     * Fetches core application entities from the backend.
     * Enforces group scoping on user data queries for regular users while parallelizing all network requests.
     */
    const fetchData = useCallback(async () => {
        const storedToken = localStorage.getItem("hunting_token");
        const storedUserId = localStorage.getItem("hunting_userId");

        if (!storedToken || !storedUserId) {
            setLoading(false);
            return;
        }

        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        try {
            setLoading(true);

            const currentUser = userRef.current;
            const storedGroupId = localStorage.getItem("hunting_groupId");
            const firstRawGid = currentUser?.groups?.[0]?.groupId;
            const fallbackGid = typeof firstRawGid === "object" && firstRawGid !== null
                ? (firstRawGid as { _id?: string; name?: string })._id || (firstRawGid as { _id?: string; name?: string }).name
                : firstRawGid ? String(firstRawGid) : undefined;
            const activeGroupIdToFetch = storedGroupId || fallbackGid;

            // Determine if users should be fetched in parallel with other entities
            const usersPromise = isAdminRef.current
                ? getUsers()
                : (activeGroupIdToFetch ? getUsers(activeGroupIdToFetch) : Promise.resolve({ data: [] as User[] }));

            // Fetch sites, phones, groups, and scoped users simultaneously in parallel
            const [sitesRes, phonesRes, groupsRes, usersRes] = await Promise.all([
                getSites(),
                getPhones(),
                getGroups(),
                usersPromise,
            ]);

            setSites(sitesRes?.data || []);
            setPhones(phonesRes?.data || []);
            const fetchedGroups: Group[] = groupsRes?.data || [];
            setGroups(fetchedGroups);
            if (usersRes?.data) {
                setUsers(usersRes.data);
            }

            // Synchronize and resolve full Group object in UserContext
            let targetGroup: Group | undefined;

            if (currentGroupRef.current?._id) {
                targetGroup = fetchedGroups.find(
                    (g) => g._id === currentGroupRef.current?._id,
                );
            }

            if (!targetGroup && storedGroupId) {
                targetGroup = fetchedGroups.find(
                    (g) => g._id === storedGroupId,
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
            }

            const activeGroupId = targetGroup?._id || storedGroupId || activeGroupIdToFetch;
            lastLoadedGroupIdRef.current = isAdminRef.current ? "admin" : (activeGroupId || null);
        } catch (error: unknown) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
            isFetchingRef.current = false;
        }
    }, [setCurrentGroup]);

    // Initial data fetch upon mount or authentication state update
    useEffect(() => {
        const storedToken = localStorage.getItem("hunting_token");
        const storedUserId = localStorage.getItem("hunting_userId");

        if (storedToken && storedUserId) {
            if (!user || lastFetchedUserIdRef.current !== user._id) {
                if (user) {
                    lastFetchedUserIdRef.current = user._id;
                }
                fetchData();
            }
        } else if (!isRestoringSession && !user) {
            lastFetchedUserIdRef.current = null;
            lastLoadedGroupIdRef.current = null;
            setSites([]);
            setPhones([]);
            setGroups([]);
            setUsers([]);
            setLoading(false);
        }
    }, [user, isRestoringSession, fetchData]);

    // Dynamically update users when the active group or admin role switches
    useEffect(() => {
        const activeGroupId = currentGroup?._id;
        if (!user || isRestoringSession || !activeGroupId) return;

        const currentKey = isAdmin ? "admin" : activeGroupId;
        // Skip if this scope was already loaded during the initial fetchData or previous switch
        if (lastLoadedGroupIdRef.current === currentKey) return;

        const fetchScopedUsers = async () => {
            try {
                if (isAdmin) {
                    const usersRes = await getUsers();
                    setUsers(usersRes?.data || []);
                } else {
                    const usersRes = await getUsers(activeGroupId);
                    setUsers(usersRes?.data || []);
                }
                lastLoadedGroupIdRef.current = currentKey;
            } catch (error: unknown) {
                console.error("Error fetching scoped users for group:", error);
            }
        };

        fetchScopedUsers();
    }, [currentGroup?._id, user, isAdmin, isRestoringSession]);

    return (
        <DataContext.Provider
            value={{
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
            }}
        >
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

