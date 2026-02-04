import {
    createContext,
    useContext,
    useState,
    useEffect,
    type ReactNode,
} from "react";
import axios from "axios";
import type { SiteCard, PhoneRow, User, Group } from "../types";

interface DataContextType {
    sites: SiteCard[];
    setSites: React.Dispatch<React.SetStateAction<SiteCard[]>>;
    phones: PhoneRow[];
    setPhones: React.Dispatch<React.SetStateAction<PhoneRow[]>>;
    // tactiSites הוסר
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    groups: Group[];
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    loading: boolean;
    refreshData: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    const [sites, setSites] = useState<SiteCard[]>([]);
    const [phones, setPhones] = useState<PhoneRow[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);

    const [loading, setLoading] = useState(true);

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

            // טוענים את כל האתרים למשתנה אחד
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

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
};
