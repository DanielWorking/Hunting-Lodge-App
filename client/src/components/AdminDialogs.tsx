import { useState, useEffect, useMemo } from "react";
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
    Avatar,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import PersonIcon from "@mui/icons-material/Person";
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
    const [name, setName] = useState("");

    // זיהוי האם מדובר בקבוצת המערכת המוגנת
    const isSystemGroup = initialData?.id === "administrators";
    const isCreateMode = !initialData;

    useEffect(() => {
        if (open) {
            setName(initialData?.name || "");
        }
    }, [initialData, open]);

    // חישוב חברי הקבוצה (רק במצב עריכה) - תיקון: בדיקה מול ID טקסטואלי ומול מונגו ID
    const groupMembers = useMemo(() => {
        if (!initialData) return [];
        return users.filter((user) =>
            user.groups?.some(
                (g) =>
                    g.groupId === initialData.id ||
                    g.groupId === initialData._id,
            ),
        );
    }, [users, initialData]);

    const handleSave = () => {
        if (!name.trim()) return;

        if (isCreateMode) {
            // --- מצב יצירה: יצירת ID אוטומטית ---
            // הופך "Shift Managers" ל- "Shift_Managers"
            const generatedId = name.trim().replace(/\s+/g, "_");

            onSave({
                name: name.trim(),
                id: generatedId,
            });
        } else {
            // --- מצב עריכה: עדכון שם בלבד ---
            onSave({ ...initialData, name: name.trim() });
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isCreateMode
                    ? "Create New Group"
                    : `Edit Group: ${initialData?.name}`}
            </DialogTitle>
            <DialogContent>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        mt: 1,
                    }}
                >
                    {/* שם הקבוצה */}
                    <Box>
                        <TextField
                            label="Group Name"
                            fullWidth
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isSystemGroup} // נעילה לאדמיניסטרטורים
                            helperText={
                                isSystemGroup
                                    ? "System group name cannot be changed."
                                    : isCreateMode
                                      ? "Group ID will be generated automatically from the name."
                                      : "Change the group name (updates everywhere)"
                            }
                        />
                    </Box>

                    {/* רשימת חברים - מוצגת רק במצב עריכה - עיצוב מחודש */}
                    {!isCreateMode && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Current Members ({groupMembers.length})
                            </Typography>

                            <Box
                                sx={{
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    maxHeight: 200,
                                    overflowY: "auto",
                                    bgcolor: "background.default",
                                    p: 1,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                {groupMembers.length > 0 ? (
                                    groupMembers.map((member) => {
                                        // מציאת פרטי החברות כדי להציג את התפקיד
                                        const membership = member.groups?.find(
                                            (g) =>
                                                g.groupId === initialData.id ||
                                                g.groupId === initialData._id,
                                        );
                                        const isManager =
                                            membership?.role ===
                                            "shift_manager";

                                        return (
                                            <Box
                                                key={member._id || member.id}
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent:
                                                        "space-between",
                                                    p: 1,
                                                    bgcolor: "background.paper",
                                                    borderRadius: 1,
                                                    border: "1px solid #eee",
                                                }}
                                            >
                                                <Box
                                                    display="flex"
                                                    alignItems="center"
                                                    gap={2}
                                                >
                                                    <Avatar
                                                        sx={{
                                                            width: 32,
                                                            height: 32,
                                                            bgcolor:
                                                                "primary.light",
                                                        }}
                                                    >
                                                        <PersonIcon fontSize="small" />
                                                    </Avatar>
                                                    <Box>
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight="bold"
                                                        >
                                                            {member.displayName ||
                                                                member.username}
                                                        </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            {member.username}
                                                        </Typography>
                                                    </Box>
                                                </Box>

                                                <Chip
                                                    label={
                                                        isManager
                                                            ? "Shift Manager"
                                                            : "Member"
                                                    }
                                                    size="small"
                                                    color={
                                                        isManager
                                                            ? "primary"
                                                            : "default"
                                                    }
                                                    variant={
                                                        isManager
                                                            ? "filled"
                                                            : "outlined"
                                                    }
                                                />
                                            </Box>
                                        );
                                    })
                                ) : (
                                    <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ p: 2, textAlign: "center" }}
                                    >
                                        No members in this group.
                                    </Typography>
                                )}
                            </Box>

                            <Alert severity="info" sx={{ mt: 2 }}>
                                To add or remove members, please edit the
                                specific User in the Users tab.
                            </Alert>
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={
                        !name.trim() ||
                        (isSystemGroup && name === initialData?.name)
                    }
                >
                    {isCreateMode ? "Create Group" : "Save Changes"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
