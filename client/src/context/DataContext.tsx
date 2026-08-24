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
    refreshData: () => void;
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

    /**
     * Fetches core application entities from the backend.
     * Enforces group scoping on user data queries for regular users.
     */
    const fetchData = useCallback(async () => {
        const storedToken = localStorage.getItem("hunting_token");
        const storedUserId = localStorage.getItem("hunting_userId");

        if (!storedToken || !storedUserId || !user || isRestoringSession) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            // Fetch sites, phones, and groups in parallel
            const [sitesRes, phonesRes, groupsRes] = await Promise.all([
                getSites(),
                getPhones(),
                getGroups(),
            ]);

            setSites(sitesRes.data);
            setPhones(phonesRes.data);
            const fetchedGroups: Group[] = groupsRes.data;
            setGroups(fetchedGroups);

            // Synchronize and resolve full Group object in UserContext
            const storedGroupId = localStorage.getItem("hunting_groupId");
            let targetGroup: Group | undefined;

            if (currentGroup?._id || currentGroup?.id) {
                targetGroup = fetchedGroups.find(
                    (g) =>
                        (g._id || g.id) ===
                        (currentGroup._id || currentGroup.id),
                );
            }

            if (!targetGroup && storedGroupId) {
                targetGroup = fetchedGroups.find(
                    (g) => (g._id || g.id) === storedGroupId,
                );
            }

            if (!targetGroup && user.groups && user.groups.length > 0) {
                const firstGid = user.groups[0].groupId;
                targetGroup = fetchedGroups.find(
                    (g) => (g._id || g.id) === firstGid,
                );
            }

            if (targetGroup) {
                setCurrentGroup(targetGroup);
            }

            // Fetch users with appropriate scope
            if (isAdmin) {
                // Administrators fetch the full directory
                const usersRes = await getUsers();
                setUsers(usersRes.data);
            } else {
                const activeGroupId =
                    targetGroup?._id ||
                    targetGroup?.id ||
                    storedGroupId ||
                    user.groups[0]?.groupId;

                if (activeGroupId) {
                    const usersRes = await getUsers(activeGroupId);
                    setUsers(usersRes.data);
                } else {
                    setUsers([]);
                }
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    }, [
        user,
        isRestoringSession,
        isAdmin,
        currentGroup?._id,
        currentGroup?.id,
        setCurrentGroup,
    ]);

    // Re-fetch data upon authentication state stabilization
    useEffect(() => {
        if (!isRestoringSession) {
            if (user) {
                fetchData();
            } else {
                setSites([]);
                setPhones([]);
                setGroups([]);
                setUsers([]);
                setLoading(false);
            }
        }
    }, [user, isRestoringSession, fetchData]);

    // Dynamically update users when the active group or admin role switches
    useEffect(() => {
        const fetchScopedUsers = async () => {
            if (!user || isRestoringSession || !currentGroup) return;

            const activeGroupId = currentGroup._id || currentGroup.id;
            if (!activeGroupId) return;

            try {
                if (isAdmin) {
                    // Full directory for administrators in the Admin group
                    const usersRes = await getUsers();
                    setUsers(usersRes.data);
                } else {
                    // Scoped member directory for standard users or admins operating in other groups
                    const usersRes = await getUsers(activeGroupId);
                    setUsers(usersRes.data);
                }
            } catch (error) {
                console.error("Error fetching scoped users for group:", error);
            }
        };

        fetchScopedUsers();
    }, [currentGroup?._id, currentGroup?.id, currentGroup?.name, user, isAdmin, isRestoringSession]);

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

