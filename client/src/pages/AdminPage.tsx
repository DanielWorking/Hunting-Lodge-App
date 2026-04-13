/**
 * @module AdminPage
 *
 * Provides the administrative dashboard for managing users and groups.
 * Includes functionality for searching, creating, editing, and deleting
 * both user and group entities.
 */

import { useState } from "react";
import { Container, Typography, Box } from "@mui/material";
import axios from "axios";

import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import type { User, Group } from "../types";

import AdminFilterBar from "../components/admin/AdminFilterBar";
import AdminTable from "../components/admin/AdminTable";
import { UserDialog, GroupDialog } from "../components/AdminDialogs";
import ConfirmDialog from "../components/ConfirmDialog";

/**
 * The main administrative dashboard component.
 *
 * Manages the state for viewing, filtering, and performing CRUD operations
 * on users and groups using a unified interface.
 *
 * @returns {JSX.Element} The rendered AdminPage component.
 */
export default function AdminPage() {
    const { users, groups, refreshData } = useData();
    const { showNotification } = useNotification();

    // --- State ---
    const [viewMode, setViewMode] = useState<"users" | "groups">("users");
    const [searchTerm, setSearchTerm] = useState("");

    // Dialog States
    const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);

    const [deleteItem, setDeleteItem] = useState<User | Group | null>(null);

    // --- Filtering ---
    const filteredUsers = users.filter(
        (u) =>
            u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (u.displayName &&
                u.displayName.toLowerCase().includes(searchTerm.toLowerCase())),
    );

    const filteredGroups = groups.filter((g) =>
        g.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // --- Handlers ---

    /**
     * Handles the click event for adding a new entity.
     * Currently only supports adding groups from this context.
     */
    const handleAddClick = () => {
        // Ensure we are in groups mode before opening the dialog
        if (viewMode === "groups") {
            setEditingGroup(null); // Reset to indicate creation mode
            setIsGroupDialogOpen(true);
        }
    };

    /**
     * Opens the appropriate dialog for editing a user or group.
     *
     * @param {User | Group} item The entity to be edited.
     */
    const handleEditClick = (item: User | Group) => {
        if (viewMode === "users") {
            setEditingUser(item as User);
            setIsUserDialogOpen(true);
        } else {
            setEditingGroup(item as Group);
            setIsGroupDialogOpen(true);
        }
    };

    /**
     * Sets the item to be deleted and triggers the confirmation dialog.
     *
     * @param {User | Group} item The entity to be deleted.
     */
    const handleDeleteClick = (item: User | Group) => {
        setDeleteItem(item);
    };

    /**
     * Retrieves the display name or username of the item currently marked for deletion.
     *
     * @returns {string} The name or username of the item.
     */
    const getDeleteItemName = () => {
        if (!deleteItem) return "";
        if ("username" in deleteItem) return (deleteItem as User).username;
        return (deleteItem as Group).name;
    };

    // --- Save Logic ---

    /**
     * Persists user changes (create or update) to the server.
     *
     * @param {Partial<User>} userData The updated user data.
     */
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

    /**
     * Persists group changes (create or update) to the server.
     *
     * @param {Partial<Group>} groupData The updated group data.
     */
    const handleSaveGroup = async (groupData: Partial<Group>) => {
        try {
            if (editingGroup) {
                // Update mode: The server expects only the name field for group updates.
                // We use _id if available for compatibility with MongoDB identifiers.
                const identifier = editingGroup._id || editingGroup.id;

                await axios.put(`/api/groups/${identifier}`, {
                    name: groupData.name,
                });
                showNotification("Group updated successfully", "success");
            } else {
                // Creation mode: The AdminDialogs component ensures id and name are present.
                await axios.post("/api/groups", groupData);
                showNotification("Group created successfully", "success");
            }

            await refreshData();
            setIsGroupDialogOpen(false);
            setEditingGroup(null);
        } catch (err: any) {
            console.error("Error saving group:", err);
            const msg = err.response?.data?.message || "Failed to save group";
            showNotification(msg, "error");
        }
    };

    // --- Delete Logic ---

    /**
     * Finalizes the deletion of the selected user or group.
     */
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
            <Box
                sx={{
                    mb: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Admin Dashboard
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Manage users and groups.
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
                allUsers={users}
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
