import { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Box,
    FormControlLabel,
    Switch,
    Typography,
    Chip,
    Divider,
    Alert,
    IconButton,
    Autocomplete,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { useData } from "../context/DataContext";
import { useUser } from "../context/UserContext";
import type { User, Group } from "../types";

// --- User Dialog ---
interface UserDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (user: Partial<User>) => void;
    initialData: User | null;
}

export function UserDialog({
    open,
    onClose,
    onSave,
    initialData,
}: UserDialogProps) {
    const { groups } = useData();
    const { user: currentUser } = useUser();

    // 1. קריאה לשם המנהל הראשי מה-ENV
    const SUPER_ADMIN_ID = import.meta.env.VITE_SUPER_ADMIN_ID;

    const [formData, setFormData] = useState<Partial<User>>({
        username: initialData?.username,
        displayName: initialData?.displayName,
        email: initialData?.email,
        isActive: true,
        vacationBalance: 0,
        groups: [],
    });

    const [groupToAdd, setGroupToAdd] = useState<Group | null>(null);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        } else {
            setFormData({
                username: "",
                isActive: true,
                vacationBalance: 0,
                groups: [],
            });
        }
        setGroupToAdd(null);
    }, [initialData, open]);

    // 2. זיהוי האם הפרופיל הנערך הוא של המנהל הראשי
    const isSuperAdminProfile = formData.username === SUPER_ADMIN_ID;

    // 3. בדיקה: האם אני עורך את עצמי?
    const isEditingSelf = (() => {
        if (!currentUser) return false;
        const currentUserId = currentUser._id || currentUser.id;
        const targetUserId = formData._id || formData.id;
        if (currentUserId && targetUserId) {
            return currentUserId === targetUserId;
        }
        return false;
    })();

    // 4. בדיקה: האם המשתמש הנערך הוא חבר בקבוצת administrators
    const isTargetUserAdmin = formData.groups?.some((membership) => {
        const groupObj = groups.find(
            (g) => (g._id || g.id) === membership.groupId,
        );
        return groupObj?.name === "administrators";
    });

    // --- לוגיקה לשינוי נתונים ---

    const handleAddGroup = () => {
        if (!groupToAdd) return;
        const groupId = groupToAdd._id || groupToAdd.id;

        setFormData((prev) => {
            const currentGroups = prev.groups || [];
            if (currentGroups.some((g) => g.groupId === groupId)) return prev;

            return {
                ...prev,
                groups: [
                    ...currentGroups,
                    { groupId: groupId, role: "member", order: 0 },
                ],
            };
        });
        setGroupToAdd(null);
    };

    const handleRemoveGroup = (groupId: string) => {
        setFormData((prev) => {
            const currentGroups = prev.groups || [];
            return {
                ...prev,
                groups: currentGroups.filter((g) => g.groupId !== groupId),
            };
        });
    };

    const handleRoleChange = (groupId: string, isManager: boolean) => {
        if (isTargetUserAdmin) {
            const groupObj = groups.find((g) => (g._id || g.id) === groupId);
            if (groupObj?.name === "administrators") return;
        }

        setFormData((prev) => {
            const currentGroups = prev.groups || [];
            return {
                ...prev,
                groups: currentGroups.map((g) =>
                    g.groupId === groupId
                        ? { ...g, role: isManager ? "shift_manager" : "member" }
                        : g,
                ),
            };
        });
    };

    const handleSave = () => {
        // שומרים רק את ה-username (System ID) ודואגים שגם ה-displayName יעודכן אם לא הוזן
        const usernameToSend = formData.username;
        // במקרה שאין שדה עריכה ל-Display Name, נשתמש בקיים או ביוזרניים כברירת מחדל
        const displayNameToSend = formData.displayName || formData.username;
        const emailToSend = formData.email;

        onSave({
            ...formData,
            username: usernameToSend,
            email: emailToSend,
            displayName: displayNameToSend,
        });
        onClose();
    };

    // סינון קבוצות שכבר נבחרו לטובת ה-Autocomplete
    const availableGroups = groups.filter((g) => {
        const gid = g._id || g.id;
        return !formData.groups?.some((mg) => mg.groupId === gid);
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit User" : "Add New User"}
            </DialogTitle>
            <DialogContent>
                <Box
                    display="flex"
                    flexDirection="column"
                    gap={2}
                    sx={{ mt: 1 }}
                >
                    <TextField
                        autoFocus
                        margin="dense"
                        label={"System ID (Username)"}
                        helperText={
                            "Enter the unique user ID exactly as it appears in the organization."
                        }
                        type={"text"}
                        fullWidth
                        disabled={!!initialData}
                        value={formData.username || ""}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                username: e.target.value,
                            })
                        }
                    />

                    {isSuperAdminProfile && (
                        <Alert severity="warning" variant="outlined">
                            <Typography variant="subtitle2" fontWeight="bold">
                                Super Administrator
                            </Typography>
                            Core system account. Some restrictions apply.
                        </Alert>
                    )}

                    <FormControlLabel
                        control={
                            <Switch
                                checked={formData.isActive || false}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        isActive: e.target.checked,
                                    })
                                }
                                disabled={isEditingSelf || isSuperAdminProfile}
                            />
                        }
                        label={
                            formData.isActive ? "Active User" : "Inactive User"
                        }
                    />

                    {isEditingSelf && (
                        <Alert severity="info" sx={{ py: 0 }}>
                            You cannot deactivate your own account.
                        </Alert>
                    )}

                    <Divider sx={{ my: 1 }}>Assigned Groups</Divider>

                    <Box
                        sx={{
                            maxHeight: 200,
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            mb: 2,
                            p: 0.5,
                        }}
                    >
                        {formData.groups?.length === 0 && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                align="center"
                            >
                                No groups assigned.
                            </Typography>
                        )}

                        {formData.groups?.map((membership) => {
                            const groupObj = groups.find(
                                (g) => (g._id || g.id) === membership.groupId,
                            );
                            if (!groupObj) return null;

                            const isAdministratorsGroup =
                                groupObj.name === "administrators";

                            const canRemove = !(
                                isAdministratorsGroup &&
                                (isSuperAdminProfile || isEditingSelf)
                            );

                            const canChangeRole = !isAdministratorsGroup;

                            return (
                                <Box
                                    key={groupObj._id || groupObj.id}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        p: 1.5,
                                        border: "1px solid #eee",
                                        borderRadius: 1,
                                        bgcolor: "background.paper",
                                    }}
                                >
                                    <Typography
                                        variant="body1"
                                        fontWeight="medium"
                                    >
                                        {groupObj.name}
                                    </Typography>

                                    <Box
                                        display="flex"
                                        alignItems="center"
                                        gap={1}
                                    >
                                        {!isAdministratorsGroup && (
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={
                                                            membership.role ===
                                                            "shift_manager"
                                                        }
                                                        disabled={
                                                            !canChangeRole
                                                        }
                                                        onChange={(e) =>
                                                            handleRoleChange(
                                                                membership.groupId,
                                                                e.target
                                                                    .checked,
                                                            )
                                                        }
                                                    />
                                                }
                                                label={
                                                    <Typography
                                                        variant="caption"
                                                        color={
                                                            !canChangeRole
                                                                ? "text.disabled"
                                                                : "text.primary"
                                                        }
                                                    >
                                                        Shift Manager
                                                    </Typography>
                                                }
                                            />
                                        )}

                                        {isAdministratorsGroup && (
                                            <Chip
                                                label="Admin Access"
                                                size="small"
                                                color="error"
                                                variant="outlined"
                                            />
                                        )}

                                        <IconButton
                                            size="small"
                                            color="error"
                                            disabled={!canRemove}
                                            onClick={() =>
                                                handleRemoveGroup(
                                                    membership.groupId,
                                                )
                                            }
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>

                    <Box
                        sx={{
                            mt: 2,
                            display: "flex",
                            gap: 1,
                            alignItems: "flex-start",
                        }}
                    >
                        <Autocomplete
                            options={availableGroups}
                            getOptionLabel={(option) => option.name}
                            value={groupToAdd}
                            onChange={(_, newValue) => setGroupToAdd(newValue)}
                            fullWidth
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Add Group"
                                    size="small"
                                    placeholder="Search group..."
                                />
                            )}
                            renderOption={(props, option) => (
                                <li {...props} key={option._id || option.id}>
                                    {option.name}
                                </li>
                            )}
                        />
                        <Button
                            variant="contained"
                            onClick={handleAddGroup}
                            disabled={!groupToAdd}
                            startIcon={<AddIcon />}
                            sx={{ mt: 0.2 }}
                        >
                            Add
                        </Button>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained">
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// --- Group Dialog ---
interface GroupDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (group: Partial<Group>) => void;
    initialData: Group | null;
}

export function GroupDialog({
    open,
    onClose,
    onSave,
    initialData,
}: GroupDialogProps) {
    const { users } = useData();
    const { user: currentUser } = useUser();
    const [formData, setFormData] = useState<Partial<Group>>({
        name: "",
        members: [],
    });

    const [userToAdd, setUserToAdd] = useState<User | null>(null);

    // חישוב החברים מתוך היוזרים ולא מהקבוצה
    useEffect(() => {
        if (initialData) {
            // זיהוי הקבוצה (תמיכה ב-ID רגיל ו-ObjectId)
            const groupId = initialData.id;
            const groupObjectId = initialData._id;

            // מציאת כל המשתמשים שמשויכים לקבוצה הזו בפועל
            const actualMembers = users
                .filter((u) =>
                    u.groups?.some(
                        (g) =>
                            g.groupId === groupId ||
                            g.groupId === groupObjectId,
                    ),
                )
                .map((u) => u._id); // לוקחים את ה-ObjectId של המשתמשים

            setFormData({
                ...initialData,
                // דריסת רשימת החברים שמגיעה מהקבוצה ברשימה המחושבת מהמשתמשים
                members: actualMembers.filter((id): id is string => !!id),
            });
        } else {
            setFormData({ name: "", members: [] });
        }
        setUserToAdd(null);
    }, [initialData, open, users]);

    const handleAddMember = () => {
        if (!userToAdd) return;

        const userId = userToAdd._id || userToAdd.id;
        if (!userId) return;

        setFormData((prev) => {
            const currentMembers = prev.members || [];
            if (currentMembers.includes(userId)) return prev;
            return {
                ...prev,
                members: [...currentMembers, userId],
            };
        });
        setUserToAdd(null);
    };

    const handleRemoveMember = (userId: string) => {
        setFormData((prev) => ({
            ...prev,
            members: (prev.members || []).filter((id) => id !== userId),
        }));
    };

    const handleSave = () => {
        const groupData: Partial<Group> = {
            ...formData,
            name: formData.name?.trim(),
        };

        if (!initialData) {
            groupData.id = formData.name?.trim();
        }

        onSave(groupData);
        onClose();
    };

    const availableUsers = users.filter((u) => {
        const uid = u._id || u.id;
        if (!uid) return false;
        return !formData.members?.includes(uid);
    });

    const isSystemGroup = initialData?.name === "administrators";

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Group" : "Add New Group"}
            </DialogTitle>
            <DialogContent>
                <Box
                    display="flex"
                    flexDirection="column"
                    gap={2}
                    sx={{ mt: 1 }}
                >
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Group Name"
                        fullWidth
                        value={formData.name || ""}
                        onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                        }
                        disabled={isSystemGroup}
                    />

                    <Divider sx={{ my: 1 }}>Group Members</Divider>

                    <Box
                        sx={{
                            maxHeight: 200,
                            overflowY: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                            p: 0.5,
                        }}
                    >
                        {(!formData.members ||
                            formData.members.length === 0) && (
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                align="center"
                            >
                                No members yet.
                            </Typography>
                        )}

                        {formData.members?.map((memberId) => {
                            const userObj = users.find(
                                (u) => u._id === memberId || u.id === memberId,
                            );

                            if (!userObj) return null;

                            const isSuperAdminUser =
                                userObj.username ===
                                import.meta.env.VITE_SUPER_ADMIN_ID;
                            // בדיקה אם זה המשתמש הנוכחי (כדי למנוע הסרה עצמית)
                            const isSelf =
                                userObj._id ===
                                (currentUser?._id || currentUser?.id);
                            // תנאי הגנה: אי אפשר להסיר אם זו קבוצת מערכת וגם (משתמש על או אני עצמי)
                            const canRemove = !(
                                isSystemGroup &&
                                (isSuperAdminUser || isSelf)
                            );

                            return (
                                <Box
                                    key={memberId}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        p: 1,
                                        border: "1px solid #eee",
                                        borderRadius: 1,
                                        bgcolor: "background.paper",
                                    }}
                                >
                                    <Box>
                                        <Typography
                                            variant="body2"
                                            fontWeight="medium"
                                        >
                                            {userObj.displayName}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            ({userObj.username})
                                        </Typography>
                                    </Box>

                                    <IconButton
                                        size="small"
                                        color="error"
                                        disabled={!canRemove}
                                        onClick={() =>
                                            handleRemoveMember(memberId)
                                        }
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            );
                        })}
                    </Box>

                    <Box
                        sx={{
                            mt: 2,
                            display: "flex",
                            gap: 1,
                            alignItems: "flex-start",
                        }}
                    >
                        <Autocomplete
                            options={availableUsers}
                            getOptionLabel={(option) =>
                                `${option.displayName} (${option.username})`
                            }
                            value={userToAdd}
                            onChange={(_, newValue) => setUserToAdd(newValue)}
                            fullWidth
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Add User to Group"
                                    size="small"
                                />
                            )}
                            renderOption={(props, option) => (
                                <li {...props} key={option._id || option.id}>
                                    <Box>
                                        <Typography variant="body2">
                                            {option.displayName}
                                        </Typography>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            {option.username}
                                        </Typography>
                                    </Box>
                                </li>
                            )}
                        />
                        <Button
                            variant="contained"
                            onClick={handleAddMember}
                            disabled={!userToAdd}
                            startIcon={<AddIcon />}
                            sx={{ mt: 0.2 }}
                        >
                            Add
                        </Button>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={!formData.name?.trim()}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
