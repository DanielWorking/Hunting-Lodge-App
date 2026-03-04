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
    Select,
    MenuItem,
    InputLabel,
    FormControl,
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
    const IS_LOCAL_MODE = import.meta.env.VITE_AUTH_MODE === "local";

    const [formData, setFormData] = useState<Partial<User>>({
        username: initialData?.username,
        displayName: initialData?.displayName,
        email: initialData?.email,
        isActive: true,
        vacationBalance: 0,
        groups: [],
    });

    const [groupToAdd, setGroupToAdd] = useState<string>("");

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
        setGroupToAdd("");
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
        return groupObj?.name.toLowerCase() === "administrators";
    });

    // --- לוגיקה לשינוי נתונים ---

    const handleAddGroup = () => {
        if (!groupToAdd) return;
        setFormData((prev) => {
            const currentGroups = prev.groups || [];
            if (currentGroups.some((g) => g.groupId === groupToAdd))
                return prev;

            return {
                ...prev,
                groups: [
                    ...currentGroups,
                    { groupId: groupToAdd, role: "member", order: 0 },
                ],
            };
        });
        setGroupToAdd("");
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
        // מניעת שינוי תפקיד בתוך קבוצת האדמינים (הם תמיד מנהלים מעצם היותם בקבוצה)
        if (isTargetUserAdmin) {
            const groupObj = groups.find((g) => (g._id || g.id) === groupId);
            if (groupObj?.name.toLowerCase() === "administrators") return;
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
        // לוגיקה מותאמת למצב (Local vs Org)
        let emailToSend = formData.email;
        let usernameToSend = formData.username;

        if (IS_LOCAL_MODE) {
            // במצב מקומי: המזהה הוא האימייל עצמו
            // אנו מעתיקים את הערך שהוזן גם לשדה האימייל כדי למנוע כפילות או שגיאות
            usernameToSend = formData.username; // השדה בטופס
            emailToSend = formData.username; // האימייל זהה למזהה
        } else {
            // במצב ארגוני: המזהה הוא ה-System ID
            // אם אין אימייל, יוצרים דמה עד לכניסה הראשונה
            if (!emailToSend) {
                emailToSend = `${formData.username}@pending.creation`;
            }
        }

        // אם אין שם תצוגה, נשתמש במזהה זמנית
        const displayNameToSend = formData.displayName || usernameToSend;

        onSave({
            ...formData,
            username: usernameToSend,
            email: emailToSend,
            displayName: displayNameToSend,
        });
        onClose();
    };

    const availableGroupsToAdd = groups.filter((g) => {
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
                    {/* שדה ID בלבד - מותאם למצב מקומי/ארגוני */}
                    <TextField
                        autoFocus
                        margin="dense"
                        // כותרת דינמית לפי המצב
                        label={
                            initialData
                                ? "User ID (Cannot be changed)"
                                : IS_LOCAL_MODE
                                  ? "Email Address (Login ID)"
                                  : "System ID (Organizational Username)"
                        }
                        // טקסט עזרה דינמי
                        helperText={
                            IS_LOCAL_MODE
                                ? "Enter the user's email address. This will be used for login."
                                : "Enter the unique user ID exactly as it appears in the organization."
                        }
                        type={IS_LOCAL_MODE ? "email" : "text"} // ולידציה בסיסית של הדפדפן
                        fullWidth
                        disabled={!!initialData}
                        // formData.username is for when in local testing at home
                        value={formData.displayName || formData.username}
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

                    {/* Active Switch - נעול ל-Super Admin ולעצמך */}
                    <FormControlLabel
                        control={
                            <Switch
                                checked={formData.isActive}
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
                            maxHeight: 300,
                            overflow: "auto",
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
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
                                groupObj.name.toLowerCase() ===
                                "administrators";

                            // לוגיקה להסרה: אסור להסיר אם זה SuperAdmin/Self מקבוצת הניהול
                            const canRemove = !(
                                isAdministratorsGroup &&
                                (isSuperAdminProfile || isEditingSelf)
                            );

                            // שינוי רול לא רלוונטי לקבוצת האדמינים
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
                            alignItems: "flex-end",
                        }}
                    >
                        <FormControl fullWidth size="small">
                            <InputLabel>Add Group</InputLabel>
                            <Select
                                value={groupToAdd}
                                label="Add Group"
                                onChange={(e) => setGroupToAdd(e.target.value)}
                            >
                                {availableGroupsToAdd.map((g) => (
                                    <MenuItem
                                        key={g._id || g.id}
                                        value={g._id || g.id}
                                    >
                                        {g.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="contained"
                            onClick={handleAddGroup}
                            disabled={!groupToAdd}
                            startIcon={<AddIcon />}
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
    const [name, setName] = useState("");

    useEffect(() => {
        if (initialData) {
            setName(initialData.name);
        } else {
            setName("");
        }
    }, [initialData, open]);

    const handleSave = () => {
        // הכנת האובייקט לשליחה
        const groupData: Partial<Group> = {
            name: name.trim(),
        };

        // תיקון הבעיה:
        // אם זו יצירת קבוצה חדשה (!initialData), השרת דורש שדה 'id'.
        // אנו מגדירים את ה-id להיות זהה ל-name, כפי שביקשת.
        if (!initialData) {
            groupData.id = name.trim();
        }

        onSave(groupData);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Group" : "Add New Group"}
            </DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
                    margin="dense"
                    label="Group Name"
                    fullWidth
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={
                        initialData?.name?.toLowerCase() === "administrators"
                    }
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={!name.trim()}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
