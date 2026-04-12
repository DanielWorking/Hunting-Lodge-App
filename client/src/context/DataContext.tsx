/**
 * @module DataContext
 *
 * Provides a global state management for core application data entities.
 * Synchronizes sites, phones, users, and groups from the backend to ensure
 * data consistency across different pages and components.
 */

import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode,
} from "react";
import axios from "axios";
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
    /** List of all system users. */
    users: User[];
    /** Direct state setter for users. */
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    /** List of all user groups/departments. */
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
 * Context provider that handles the initial data fetch and state distribution.
 * 
 * Automatically attempts to fetch data on mount if a valid user ID is found
 * in local storage. Wraps the application to provide global data access.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The provider component wrapping its children.
 */
export const DataProvider = ({ children }: { children: ReactNode }) => {
    const [sites, setSites] = useState<SiteCard[]>([]);
    const [phones, setPhones] = useState<PhoneRow[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);

    const [loading, setLoading] = useState(true);

    /**
     * Fetches all core entities from the backend in parallel.
     * 
     * Requires an authenticated session (via stored userId). Updates multiple
     * state slices simultaneously and manages the global loading state.
     * 
     * @returns {Promise<void>}
     */
    const fetchData = async () => {
        const storedUserId = localStorage.getItem("hunting_userId");
        if (!storedUserId) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const [sitesRes, phonesRes, groupsRes, usersRes] =
                await Promise.all([
                    axios.get("/api/sites"),
                    axios.get("/api/phones"),
                    axios.get("/api/groups"),
                    axios.get("/api/users"),
                ]);

            // Consolidate and update site records in the state.
            setSites(sitesRes.data);

            setPhones(phonesRes.data);
            setGroups(groupsRes.data);
            setUsers(usersRes.data);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

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
