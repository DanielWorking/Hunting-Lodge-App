/**
 * @module MembersTab
 *
 * Provides a management interface for group members and report recipients.
 * Allows administrators to reorder members, toggle active status, adjust
 * vacation balances, and manage the list of email recipients for reports.
 */

import { useState, useEffect } from "react";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    TextField,
    Tooltip,
    Switch,
    Button,
    Typography,
    List,
    ListItem,
    ListItemText,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import axios from "axios";

/**
 * Renders the group members management tab.
 *
 * Integrates with DataContext for user and group data, and UserContext for
 * the current group context. Handles member reordering, status updates,
 * and report email distribution lists.
 *
 * @returns {JSX.Element} The rendered MembersTab component.
 */
export default function MembersTab() {
    const { currentGroup } = useUser();
    const { users, refreshData, groups } = useData();
    const { showNotification } = useNotification();

    // Match the current group context with the detailed group data from the global store
    const activeGroupData = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id),
    );

    const [emails, setEmails] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState("");

    /** @type {Object} Tracking local edits to member properties before they are persisted. */
    const [editedValues, setEditedValues] = useState<{
        [key: string]: { vacation: number; active: boolean };
    }>({});
    const [sortedMembers, setSortedMembers] = useState<any[]>([]);

    useEffect(() => {
        if (!currentGroup || users.length === 0) return;

        // Filter and map members belonging to the current group
        const members = users
            .filter((u) =>
                u.groups?.some(
                    (g) => g.groupId === (currentGroup._id || currentGroup.id),
                ),
            )
            .map((u) => {
                const membership = u.groups?.find(
                    (g) => g.groupId === (currentGroup._id || currentGroup.id),
                );
                return { ...u, membership };
            });

        members.sort(
            (a, b) => (a.membership?.order || 0) - (b.membership?.order || 0),
        );
        setSortedMembers(members);
    }, [users, currentGroup]);

    // Load initial report emails from group data
    useEffect(() => {
        if (activeGroupData) {
            // Ensure backwards compatibility by forcing array type if legacy string format exists
            const existing = activeGroupData.reportEmails || [];
            setEmails(Array.isArray(existing) ? existing : []);
        }
    }, [activeGroupData]);

    /**
     * Adds the current value of newEmail to the recipients list.
     * Prevents duplicates and empty strings.
     */
    const handleAddEmail = () => {
        if (newEmail && !emails.includes(newEmail)) {
            setEmails([...emails, newEmail]);
            setNewEmail("");
        }
    };

    /**
     * Removes a specific email from the recipients list.
     *
     * @param {string} emailToDelete  The email address to remove from the list.
     */
    const handleDeleteEmail = (emailToDelete: string) => {
        setEmails(emails.filter((e) => e !== emailToDelete));
    };

    /**
     * Persists the updated report email list to the server.
     *
     * @returns {Promise<void>}
     */
    const handleSaveEmails = async () => {
        if (!currentGroup) return;
        try {
            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}`,
                {
                    reportEmails: emails,
                },
            );
            showNotification("Emails updated", "success");
            refreshData();
        } catch (e) {
            showNotification("Error", "error");
        }
    };

    /**
     * Updates local state when a member's property is edited.
     *
     * @param {string}                   userId  The unique identifier of the user being edited.
     * @param {"vacation" | "active"}    field   The property being changed (vacation balance or active status).
     * @param {any}                      value   The new value for the field.
     */
    const handleChange = (
        userId: string,
        field: "vacation" | "active",
        value: any,
    ) => {
        setEditedValues((prev) => ({
            ...prev,
            [userId]: {
                vacation:
                    field === "vacation"
                        ? value
                        : (prev[userId]?.vacation ??
                          sortedMembers.find((u) => (u._id || u.id) === userId)
                              ?.vacationBalance),
                active:
                    field === "active"
                        ? value
                        : (prev[userId]?.active ??
                          sortedMembers.find((u) => (u._id || u.id) === userId)
                              ?.isActive),
            },
        }));
    };

    /**
     * Saves changes for a specific user to the backend.
     *
     * @param {string} userId  The unique identifier of the user to update.
     * @returns {Promise<void>}
     */
    const handleSaveUser = async (userId: string) => {
        const changes = editedValues[userId];
        if (!changes) return;

        try {
            await axios.patch(`/api/users/${userId}/manager-update`, {
                isActive: changes.active,
                vacationBalance: Number(changes.vacation),
            });
            showNotification("User updated", "success");
            refreshData();

            const newValues = { ...editedValues };
            delete newValues[userId];
            setEditedValues(newValues);
        } catch (error) {
            showNotification("Error updating user", "error");
        }
    };

    /**
     * Swaps the position of two members in the group's display order.
     *
     * @param {number}          index      The current index of the member to move.
     * @param {"up" | "down"}   direction  The direction to shift the member.
     * @returns {Promise<void>}
     */
    const handleMove = async (index: number, direction: "up" | "down") => {
        const newIndex = direction === "up" ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= sortedMembers.length) return;

        const newSorted = [...sortedMembers];
        [newSorted[index], newSorted[newIndex]] = [
            newSorted[newIndex],
            newSorted[index],
        ];

        const updates = newSorted.map((u, i) => ({
            userId: u._id || u.id,
            order: i,
        }));

        setSortedMembers(newSorted);

        try {
            await axios.put("/api/users/reorder/group", {
                groupId: currentGroup?._id || currentGroup?.id,
                updates,
            });
            refreshData();
        } catch (error) {
            showNotification("Error reordering", "error");
            refreshData();
        }
    };

    return (
        <Box p={3}>
            {/* --- Report Emails Section --- */}
            <Box mb={4} p={2} bgcolor="action.hover" borderRadius={1}>
                <Typography variant="subtitle2" gutterBottom>
                    Report Recipients
                </Typography>

                <Box display="flex" gap={1} mb={2}>
                    <TextField
                        label="Add Email"
                        size="small"
                        fullWidth
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                    />
                    <Button
                        variant="contained"
                        onClick={handleAddEmail}
                        startIcon={<AddIcon />}
                    >
                        Add
                    </Button>
                </Box>

                <List dense>
                    {emails.map((email) => (
                        <ListItem
                            key={email}
                            secondaryAction={
                                <IconButton
                                    edge="end"
                                    onClick={() => handleDeleteEmail(email)}
                                >
                                    <DeleteIcon />
                                </IconButton>
                            }
                        >
                            <ListItemText primary={email} />
                        </ListItem>
                    ))}
                    {emails.length === 0 && (
                        <Typography variant="caption" color="text.secondary">
                            No emails defined
                        </Typography>
                    )}
                </List>

                <Button
                    variant="outlined"
                    fullWidth
                    onClick={handleSaveEmails}
                    sx={{ mt: 1 }}
                >
                    Save Email List
                </Button>
            </Box>

            {/* --- Members Table Section --- */}
            <Typography variant="h6" gutterBottom>
                Group Members ({sortedMembers.length})
            </Typography>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell align="center">Order</TableCell>

                            {/* System identifier (e.g., organizational ID or email) */}
                            <TableCell sx={{ fontWeight: "bold" }}>
                                System ID
                            </TableCell>

                            {/* Display name (Full name or preferred username) */}
                            <TableCell sx={{ fontWeight: "bold" }}>
                                Full Name
                            </TableCell>

                            <TableCell>Role</TableCell>
                            <TableCell align="center">
                                Active (Global)
                            </TableCell>
                            <TableCell align="center">
                                Vacation Balance
                            </TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedMembers.map((user, index) => {
                            const userId = user._id || user.id;
                            const isEdited = !!editedValues[userId];

                            // Check if the user is the designated super admin
                            const isSuperAdmin =
                                user.username ===
                                import.meta.env.VITE_SUPER_ADMIN_ID;

                            const currentVacation = isEdited
                                ? editedValues[userId].vacation
                                : user.vacationBalance;
                            const currentActive = isEdited
                                ? editedValues[userId].active
                                : user.isActive;

                            return (
                                <TableRow key={userId} hover>
                                    {/* Order Arrows */}
                                    <TableCell align="center">
                                        <Box
                                            display="flex"
                                            flexDirection="column"
                                        >
                                            <IconButton
                                                size="small"
                                                disabled={index === 0}
                                                onClick={() =>
                                                    handleMove(index, "up")
                                                }
                                            >
                                                <ArrowUpwardIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                disabled={
                                                    index ===
                                                    sortedMembers.length - 1
                                                }
                                                onClick={() =>
                                                    handleMove(index, "down")
                                                }
                                            >
                                                <ArrowDownwardIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </TableCell>

                                    {/* Column 1: System ID*/}
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            fontFamily="monospace"
                                        >
                                            {user.username}
                                        </Typography>
                                    </TableCell>

                                    {/* Column 2: Display Name */}
                                    <TableCell>
                                        <Typography
                                            variant="body2"
                                            fontWeight="medium"
                                        >
                                            {user.displayName}
                                        </Typography>
                                    </TableCell>

                                    {/* Role */}
                                    <TableCell>
                                        {user.membership?.role ===
                                        "shift_manager" ? (
                                            <Typography
                                                variant="caption"
                                                color="primary"
                                                fontWeight="bold"
                                                sx={{
                                                    border: 1,
                                                    borderColor: "primary.main",
                                                    borderRadius: 1,
                                                    px: 1,
                                                    py: 0.5,
                                                }}
                                            >
                                                Shift Manager
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2">
                                                Member
                                            </Typography>
                                        )}
                                    </TableCell>

                                    {/* Active Status */}
                                    <TableCell align="center">
                                        <Switch
                                            checked={currentActive}
                                            onChange={(e) =>
                                                handleChange(
                                                    userId,
                                                    "active",
                                                    e.target.checked,
                                                )
                                            }
                                            color={
                                                currentActive
                                                    ? "success"
                                                    : "default"
                                            }
                                            disabled={isSuperAdmin}
                                        />
                                    </TableCell>

                                    {/* Vacation Balance */}
                                    <TableCell align="center">
                                        <TextField
                                            type="number"
                                            size="small"
                                            sx={{ width: 80 }}
                                            value={currentVacation}
                                            onChange={(e) =>
                                                handleChange(
                                                    userId,
                                                    "vacation",
                                                    e.target.value,
                                                )
                                            }
                                        />
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell align="center">
                                        <Tooltip title="Save Changes">
                                            <span>
                                                <IconButton
                                                    color="primary"
                                                    disabled={!isEdited}
                                                    onClick={() =>
                                                        handleSaveUser(userId)
                                                    }
                                                >
                                                    <SaveIcon />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {sortedMembers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center">
                                    No members found in this group.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
