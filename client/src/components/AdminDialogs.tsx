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

    const [formData, setFormData] = useState<Partial<User>>({
        username: "",
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

    // --- זיהוי סוג המשתמש הנערך ---
    const isSuperAdminProfile = formData.username === "Admin";

    // האם המשתמש הנערך הוא אדמין כלשהו (חבר בקבוצת administrators)
    const isTargetUserAdmin = formData.groups?.some((membership) => {
        const groupObj = groups.find(
            (g) => (g._id || g.id) === membership.groupId
        );
        return groupObj?.name.toLowerCase() === "administrators";
    });

    // === התיקון: בדיקת "האם אני עורך את עצמי" בצורה בטוחה ===
    const isEditingSelf = (() => {
        if (!currentUser) return false;

        // שליפת המזהים בצורה בטוחה (תמיכה ב-_id וגם ב-id)
        const currentUserId = currentUser._id || currentUser.id;
        const targetUserId = formData._id || formData.id;

        // השוואה רק אם שני המזהים קיימים
        if (currentUserId && targetUserId) {
            return currentUserId === targetUserId;
        }
        return false;
    })();
    // ========================================================

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
        if (isTargetUserAdmin) return;

        setFormData((prev) => {
            const currentGroups = prev.groups || [];
            return {
                ...prev,
                groups: currentGroups.map((g) =>
                    g.groupId === groupId
                        ? { ...g, role: isManager ? "shift_manager" : "member" }
                        : g
                ),
            };
        });
    };

    const handleSave = () => {
        onSave(formData);
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
                    <TextField
                        label="Username"
                        value={formData.username}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                username: e.target.value,
                            })
                        }
                        fullWidth
                        disabled={isSuperAdminProfile}
                    />

                    {isSuperAdminProfile && (
                        <Alert severity="warning" variant="outlined">
                            <Typography variant="subtitle2" fontWeight="bold">
                                Super Administrator
                            </Typography>
                            This is the main system account. Full access
                            granted.
                        </Alert>
                    )}

                    {!isSuperAdminProfile && (
                        <>
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
                                        // כפתור נעול רק אם: אני עורך את עצמי, או אם אני עורך אדמין אחר (לפי בקשתך הקודמת)
                                        // אם תרצה לאפשר עריכת סטטוס לאדמינים אחרים, תמחק את "|| isTargetUserAdmin"
                                        disabled={
                                            isEditingSelf || isTargetUserAdmin
                                        }
                                    />
                                }
                                label={
                                    formData.isActive
                                        ? "Active User"
                                        : "Inactive User"
                                }
                            />

                            {isEditingSelf && (
                                <Alert severity="info" sx={{ py: 0 }}>
                                    You cannot deactivate your own account.
                                </Alert>
                            )}

                            {/* אם זה אדמין אחר ואנחנו לא יכולים לשנות לו סטטוס, נוסיף הסבר קטן */}
                            {isTargetUserAdmin && !isEditingSelf && (
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    Status of other administrators cannot be
                                    changed here.
                                </Typography>
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
                                        (g) =>
                                            (g._id || g.id) ===
                                            membership.groupId
                                    );
                                    if (!groupObj) return null;

                                    const isAdministratorsGroup =
                                        groupObj.name.toLowerCase() ===
                                        "administrators";

                                    const canRemove = !(
                                        isAdministratorsGroup && isEditingSelf
                                    );
                                    const canChangeRole =
                                        !isTargetUserAdmin &&
                                        !isAdministratorsGroup;

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
                                                                        "shift_manager" ||
                                                                    isTargetUserAdmin
                                                                }
                                                                disabled={
                                                                    !canChangeRole
                                                                }
                                                                onChange={(e) =>
                                                                    handleRoleChange(
                                                                        membership.groupId,
                                                                        e.target
                                                                            .checked
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
                                                            membership.groupId
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
                                        onChange={(e) =>
                                            setGroupToAdd(e.target.value)
                                        }
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
                        </>
                    )}
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

// --- Group Dialog (No Changes) ---
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
        onSave({ name });
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
                <Button onClick={handleSave} variant="contained">
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
