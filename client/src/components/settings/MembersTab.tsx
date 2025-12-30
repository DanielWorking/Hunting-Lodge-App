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
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import axios from "axios";

export default function MembersTab() {
    const { currentGroup } = useUser();
    // === תיקון: הוספת groups ===
    const { users, refreshData, groups } = useData();
    const { showNotification } = useNotification();

    // מציאת הקבוצה הנוכחית כדי לקבל את המייל שלה
    const activeGroupData = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id)
    );

    const [emails, setEmails] = useState<string[]>([]);
    const [newEmail, setNewEmail] = useState("");

    // State מקומי לנתוני העריכה
    const [editedValues, setEditedValues] = useState<{
        [key: string]: { vacation: number; active: boolean };
    }>({});
    const [sortedMembers, setSortedMembers] = useState<any[]>([]);

    useEffect(() => {
        if (!currentGroup || users.length === 0) return;

        const members = users
            .filter((u) =>
                u.groups.some(
                    (g) => g.groupId === (currentGroup._id || currentGroup.id)
                )
            )
            .map((u) => {
                const membership = u.groups.find(
                    (g) => g.groupId === (currentGroup._id || currentGroup.id)
                );
                return { ...u, membership };
            });

        members.sort(
            (a, b) => (a.membership?.order || 0) - (b.membership?.order || 0)
        );
        setSortedMembers(members);
    }, [users, currentGroup]);

    // טעינת המייל ההתחלתי
    useEffect(() => {
        if (activeGroupData) {
            // תמיכה לאחור (אם היה string, נהפוך למערך)
            const existing = activeGroupData.reportEmails || [];
            setEmails(Array.isArray(existing) ? existing : []);
        }
    }, [activeGroupData]);

    const handleAddEmail = () => {
        if (newEmail && !emails.includes(newEmail)) {
            setEmails([...emails, newEmail]);
            setNewEmail("");
        }
    };

    const handleDeleteEmail = (emailToDelete: string) => {
        setEmails(emails.filter((e) => e !== emailToDelete));
    };

    const handleSaveEmails = async () => {
        if (!currentGroup) return;
        try {
            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...activeGroupData?.settings,
                    reportEmails: emails, // שליחת המערך
                }
            );
            showNotification("Emails updated", "success");
            refreshData();
        } catch (e) {
            showNotification("Error", "error");
        }
    };

    const handleChange = (
        userId: string,
        field: "vacation" | "active",
        value: any
    ) => {
        setEditedValues((prev) => ({
            ...prev,
            [userId]: {
                vacation:
                    field === "vacation"
                        ? value
                        : prev[userId]?.vacation ??
                          sortedMembers.find((u) => (u._id || u.id) === userId)
                              ?.vacationBalance,
                active:
                    field === "active"
                        ? value
                        : prev[userId]?.active ??
                          sortedMembers.find((u) => (u._id || u.id) === userId)
                              ?.isActive,
            },
        }));
    };

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

            <h3>Manage Members & Order</h3>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell align="center">Order</TableCell>
                            <TableCell>Name</TableCell>
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

                            const currentVacation = isEdited
                                ? editedValues[userId].vacation
                                : user.vacationBalance;
                            const currentActive = isEdited
                                ? editedValues[userId].active
                                : user.isActive;

                            return (
                                <TableRow key={userId}>
                                    <TableCell align="center">
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
                                    </TableCell>

                                    <TableCell sx={{ fontWeight: "bold" }}>
                                        {user.username}
                                    </TableCell>
                                    <TableCell>
                                        {user.membership?.role ===
                                        "shift_manager"
                                            ? "Shift Manager"
                                            : "Member"}
                                    </TableCell>

                                    <TableCell align="center">
                                        <Switch
                                            checked={currentActive}
                                            onChange={(e) =>
                                                handleChange(
                                                    userId,
                                                    "active",
                                                    e.target.checked
                                                )
                                            }
                                            color={
                                                currentActive
                                                    ? "success"
                                                    : "default"
                                            }
                                        />
                                    </TableCell>

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
                                                    e.target.value
                                                )
                                            }
                                        />
                                    </TableCell>

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
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
