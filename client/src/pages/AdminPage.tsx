import { useState } from "react";
import { Container, Typography, Box } from "@mui/material";
import axios from "axios";

import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import type { User, Group } from "../types";

// קומפוננטות פנימיות
import AdminFilterBar from "../components/admin/AdminFilterBar";
import AdminTable from "../components/admin/AdminTable";
import { UserDialog, GroupDialog } from "../components/AdminDialogs";
import ConfirmDialog from "../components/ConfirmDialog";

export default function AdminPage() {
    const { users, groups, refreshData } = useData();
    const { showNotification } = useNotification();

    // === State ===
    const [viewMode, setViewMode] = useState<"users" | "groups">("users");
    const [searchTerm, setSearchTerm] = useState("");

    // Dialog States
    const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);

    const [deleteItem, setDeleteItem] = useState<User | Group | null>(null);

    // === Filtering ===
    const filteredUsers = users.filter((u) =>
        u.username.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const filteredGroups = groups.filter((g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // === Handlers ===

    const handleAddClick = () => {
        if (viewMode === "users") {
            setEditingUser(null);
            setIsUserDialogOpen(true);
        } else {
            setEditingGroup(null);
            setIsGroupDialogOpen(true);
        }
    };

    const handleEditClick = (item: User | Group) => {
        if (viewMode === "users") {
            setEditingUser(item as User);
            setIsUserDialogOpen(true);
        } else {
            setEditingGroup(item as Group);
            setIsGroupDialogOpen(true);
        }
    };

    const handleDeleteClick = (item: User | Group) => {
        setDeleteItem(item);
    };

    const getDeleteItemName = () => {
        if (!deleteItem) return "";
        if ("username" in deleteItem) return (deleteItem as User).username;
        return (deleteItem as Group).name;
    };

    // --- Save Logic ---

    const handleSaveUser = async (userData: Partial<User>) => {
        try {
            if (editingUser) {
                await axios.put(
                    `/api/users/${editingUser._id || editingUser.id}`,
                    userData,
                );
                showNotification("User updated successfully", "success");
            } else {
                await axios.post("/api/users", userData);
                showNotification("User created successfully", "success");
            }
            refreshData();
            setIsUserDialogOpen(false);
        } catch (error) {
            console.error(error);
            showNotification("Error saving user", "error");
        }
    };

    const handleSaveGroup = async (groupData: Partial<Group>) => {
        try {
            if (editingGroup) {
                // בעדכון - שולחים רק מה שהשתנה
                await axios.put(
                    `/api/groups/${editingGroup._id || editingGroup.id}`,
                    groupData,
                );
                showNotification("Group updated successfully", "success");
            } else {
                // ביצירה - התיקון לשגיאת 400: הוספת שדות חובה כברירת מחדל
                const newGroupPayload = {
                    ...groupData,
                    settings: { shiftTypes: [] }, // אתחול הגדרות ריקות
                    members: [], // אתחול רשימת חברים ריקה
                };
                await axios.post("/api/groups", newGroupPayload);
                showNotification("Group created successfully", "success");
            }
            refreshData();
            setIsGroupDialogOpen(false);
        } catch (error) {
            console.error(error);
            showNotification("Error saving group", "error");
        }
    };

    // --- Delete Logic ---

    const handleConfirmDelete = async () => {
        if (!deleteItem) return;

        const id = deleteItem._id || deleteItem.id;
        const isUser = "username" in deleteItem;

        try {
            if (isUser) {
                await axios.delete(`/api/users/${id}`);
                showNotification("User deleted", "success");
            } else {
                await axios.delete(`/api/groups/${id}`);
                showNotification("Group deleted", "success");
            }
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error deleting item", "error");
        } finally {
            setDeleteItem(null);
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Admin Dashboard
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Manage users, groups, and system settings.
                </Typography>
            </Box>

            {/* 1. Filter Bar */}
            <AdminFilterBar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onAddClick={handleAddClick}
            />

            {/* 2. Table */}
            <AdminTable
                viewMode={viewMode}
                users={filteredUsers}
                groups={filteredGroups}
                allGroups={groups}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
            />

            {/* 3. Dialogs */}
            <UserDialog
                open={isUserDialogOpen}
                onClose={() => setIsUserDialogOpen(false)}
                onSave={handleSaveUser}
                initialData={editingUser}
            />
            <GroupDialog
                open={isGroupDialogOpen}
                onClose={() => setIsGroupDialogOpen(false)}
                onSave={handleSaveGroup}
                initialData={editingGroup}
            />

            <ConfirmDialog
                open={!!deleteItem}
                title={
                    deleteItem ? `Delete "${getDeleteItemName()}"?` : "Delete"
                }
                content="Are you sure? This action cannot be undone."
                onCancel={() => setDeleteItem(null)}
                onConfirm={handleConfirmDelete}
            />
        </Container>
    );
}
