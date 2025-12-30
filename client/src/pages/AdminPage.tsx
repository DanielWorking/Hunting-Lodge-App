import { useState, useEffect } from "react";
import {
    Container,
    Typography,
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    ToggleButton,
    ToggleButtonGroup,
    TextField,
    Tooltip,
} from "@mui/material";
import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import { UserDialog, GroupDialog } from "../components/AdminDialogs";
import ConfirmDialog from "../components/ConfirmDialog";
import axios from "axios";
import type { User, Group, GroupMembership } from "../types";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";

export default function AdminPage() {
    const { users, setUsers, groups, setGroups, refreshData } = useData();
    const { showNotification } = useNotification();

    const [viewMode, setViewMode] = useState<"users" | "groups">("users");
    const [searchTerm, setSearchTerm] = useState("");

    const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<Group | null>(null);

    const [deleteItem, setDeleteItem] = useState<User | Group | null>(null);

    useEffect(() => {
        refreshData();
    }, []);

    const handleSaveUser = async (userData: Partial<User>) => {
        try {
            if (editingUser) {
                await axios.put(
                    `/api/users/${editingUser.id || editingUser._id}`,
                    userData
                );
            } else {
                await axios.post("/api/users", {
                    ...userData,
                    lastLogin: "Never",
                });
            }
            showNotification("User saved successfully", "success");
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error saving user", "error");
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteItem) return;
        const idToDelete = deleteItem._id || deleteItem.id;
        try {
            await axios.delete(`/api/users/${idToDelete}`);
            showNotification("User deleted", "success");
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error deleting user", "error");
        } finally {
            setDeleteItem(null);
        }
    };

    const handleSaveGroup = async (groupData: Partial<Group>) => {
        try {
            if (editingGroup) {
                await axios.put(
                    `/api/groups/${editingGroup.id || editingGroup._id}`,
                    groupData
                );
            } else {
                await axios.post("/api/groups", groupData);
            }
            showNotification("Group saved successfully", "success");
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error saving group", "error");
        }
    };

    const handleDeleteGroup = async () => {
        if (!deleteItem) return;
        const idToDelete = deleteItem._id || deleteItem.id;
        try {
            await axios.delete(`/api/groups/${idToDelete}`);
            showNotification("Group deleted", "success");
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error deleting group", "error");
        } finally {
            setDeleteItem(null);
        }
    };

    const filteredList =
        viewMode === "users"
            ? users.filter((u) =>
                  u.username.toLowerCase().includes(searchTerm.toLowerCase())
              )
            : groups.filter((g) =>
                  g.name.toLowerCase().includes(searchTerm.toLowerCase())
              );

    const getGroupNames = (memberships: GroupMembership[]) => {
        if (!memberships || !Array.isArray(memberships)) return "";

        const names = memberships
            .map((m) => groups.find((g) => (g._id || g.id) === m.groupId)?.name)
            .filter(Boolean);

        return names.length > 3
            ? `${names.slice(0, 3).join(", ")}...`
            : names.join(", ");
    };

    const getMembersByGroup = (groupId: string) => {
        const groupMembers = users.filter((u) =>
            u.groups.some((g) => g.groupId === groupId)
        );

        const names = groupMembers.map((u) => u.username);
        if (names.length === 0) return "No members";
        return names.length > 3
            ? `${names.slice(0, 3).join(", ")}...`
            : names.join(", ");
    };

    const formatDate = (dateString: string) => {
        if (!dateString || dateString === "Never") return "Never";
        try {
            return new Date(dateString).toLocaleString("he-IL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch (e) {
            return dateString;
        }
    };

    const getDeleteItemName = () => {
        if (!deleteItem) return "";
        return viewMode === "users"
            ? (deleteItem as User).username
            : (deleteItem as Group).name;
    };

    // פונקציית עזר לבדיקה האם מותר למחוק
    const canDelete = (item: any) => {
        if (viewMode === "groups") {
            // הגנה על קבוצת administrators
            return item.name.toLowerCase() !== "administrators";
        } else {
            // הגנה על משתמשים:
            // 1. אי אפשר למחוק את Admin הראשי
            if (item.username === "Admin") return false;

            // 2. אי אפשר למחוק משתמש שהוא חבר בקבוצת administrators (מניעת טעות אנוש)
            const isAdmin = item.groups.some((m: GroupMembership) => {
                const g = groups.find(
                    (grp) => (grp._id || grp.id) === m.groupId
                );
                return g?.name.toLowerCase() === "administrators";
            });

            return !isAdmin;
        }
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold", color: "#d32f2f" }}
                >
                    Admin Management
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Manage system users, groups, and permissions.
                </Typography>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mb: 4,
                    alignItems: "center",
                    bgcolor: "background.paper",
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 1,
                }}
            >
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, val) => val && setViewMode(val)}
                    size="small"
                >
                    <ToggleButton value="users">
                        <PersonIcon sx={{ mr: 1 }} /> Users
                    </ToggleButton>
                    <ToggleButton value="groups">
                        <GroupIcon sx={{ mr: 1 }} /> Groups
                    </ToggleButton>
                </ToggleButtonGroup>

                <TextField
                    size="small"
                    label={`Search ${viewMode}...`}
                    variant="outlined"
                    sx={{ flexGrow: 1 }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <Button
                    variant="contained"
                    color="error"
                    startIcon={<AddIcon />}
                    onClick={() => {
                        if (viewMode === "users") {
                            setEditingUser(null);
                            setIsUserDialogOpen(true);
                        } else {
                            setEditingGroup(null);
                            setIsGroupDialogOpen(true);
                        }
                    }}
                >
                    Add {viewMode === "users" ? "User" : "Group"}
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead
                        sx={{
                            bgcolor: (theme) =>
                                theme.palette.mode === "dark"
                                    ? "background.default"
                                    : "#f5f5f5",
                        }}
                    >
                        <TableRow>
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Name
                            </TableCell>
                            {viewMode === "users" && (
                                <TableCell sx={{ fontWeight: "bold" }}>
                                    Member of Groups
                                </TableCell>
                            )}
                            <TableCell sx={{ fontWeight: "bold" }}>
                                {viewMode === "users"
                                    ? "Last Login"
                                    : "Created At"}
                            </TableCell>
                            <TableCell
                                align="center"
                                sx={{ fontWeight: "bold" }}
                            >
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredList.map((item: any) => (
                            <TableRow key={item._id || item.id}>
                                <TableCell sx={{ fontWeight: "bold" }}>
                                    {viewMode === "users"
                                        ? item.username
                                        : item.name.toUpperCase()}
                                </TableCell>

                                {viewMode === "users" && (
                                    <TableCell>
                                        {getGroupNames(item.groups)}
                                    </TableCell>
                                )}

                                <TableCell>
                                    {formatDate(
                                        viewMode === "users"
                                            ? item.lastLogin
                                            : item.createdAt
                                    )}
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title="Edit">
                                        <IconButton
                                            onClick={() => {
                                                if (viewMode === "users") {
                                                    setEditingUser(item);
                                                    setIsUserDialogOpen(true);
                                                } else {
                                                    setEditingGroup(item);
                                                    setIsGroupDialogOpen(true);
                                                }
                                            }}
                                        >
                                            <EditIcon />
                                        </IconButton>
                                    </Tooltip>

                                    {/* כפתור המחיקה מופיע רק אם מותר למחוק */}
                                    {canDelete(item) && (
                                        <Tooltip title="Delete">
                                            <IconButton
                                                onClick={() =>
                                                    setDeleteItem(item)
                                                }
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

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
                    deleteItem
                        ? `Delete "${getDeleteItemName()}"?`
                        : "Delete Item"
                }
                content={`Are you sure? This action cannot be undone.`}
                onCancel={() => setDeleteItem(null)}
                onConfirm={
                    viewMode === "users" ? handleDeleteUser : handleDeleteGroup
                }
            />
        </Container>
    );
}
