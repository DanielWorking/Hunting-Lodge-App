import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Typography,
    Box,
    Tooltip,
    useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SecurityIcon from "@mui/icons-material/Security";

import type { User, Group } from "../../types";

// === פתרון מקומי לבעיית הטיפוסים ===
type ExtendedUser = User & {
    isAdmin?: boolean;
    isShiftManager?: boolean;
    createdAt?: string | Date;
};

type ExtendedGroup = Group & {
    createdAt?: string | Date;
};

interface AdminTableProps {
    viewMode: "users" | "groups";
    users: User[];
    groups: Group[];
    allGroups: Group[];
    onEdit: (item: User | Group) => void;
    onDelete: (item: User | Group) => void;
}

export default function AdminTable({
    viewMode,
    users,
    groups,
    allGroups,
    onEdit,
    onDelete,
}: AdminTableProps) {
    const theme = useTheme();

    const headerBgColor =
        theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f5";

    const formatDate = (dateString?: string | Date) => {
        if (!dateString) return "-";
        return new Date(dateString).toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    const getLastLoginDisplay = (dateString?: string) => {
        // 1. אם אין מחרוזת בכלל
        if (!dateString) {
            return (
                <Typography variant="body2" color="error" fontWeight="bold">
                    Never
                </Typography>
            );
        }

        const date = new Date(dateString);

        // 2. אם התאריך לא תקין (Invalid Date)
        if (isNaN(date.getTime())) {
            return (
                <Typography variant="body2" color="error" fontWeight="bold">
                    Never
                </Typography>
            );
        }

        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // פורמט תאריך
        const formatted = date.toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });

        // אם עברו יותר מ-90 יום
        if (diffDays > 90) {
            return (
                <Typography variant="body2" color="error" fontWeight="bold">
                    {formatted}
                </Typography>
            );
        }

        return formatted;
    };

    // --- User Row Render ---
    const renderUserRow = (rawUser: User) => {
        const user = rawUser as unknown as ExtendedUser;
        const superAdminId = import.meta.env.VITE_SUPER_ADMIN_ID;
        const isSuperAdmin = user.username === superAdminId;

        // לוגיקת תצוגת קבוצות - מקסימום 2
        const userGroups = user.groups || [];
        const visibleGroups = userGroups.slice(0, 2);
        const hiddenGroupsCount = userGroups.length - 2;

        return (
            <TableRow key={user._id || user.id} hover>
                {/* 1. System ID (Username) */}
                <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                        {user.username}
                    </Typography>
                </TableCell>

                {/* 2. Name (Display Name) */}
                <TableCell sx={{ fontWeight: "bold" }}>
                    <Typography variant="body2">{user.displayName}</Typography>
                </TableCell>

                {/* 3. Groups (Max 2 + Chip) */}
                <TableCell>
                    <Box
                        display="flex"
                        flexWrap="wrap"
                        gap={0.5}
                        alignItems="center"
                    >
                        {visibleGroups.length > 0 ? (
                            visibleGroups.map((g, idx) => {
                                const groupName =
                                    allGroups.find(
                                        (grp) =>
                                            (grp._id || grp.id) === g.groupId,
                                    )?.name || "Unknown";
                                return (
                                    <Chip
                                        key={idx}
                                        label={groupName}
                                        size="small"
                                        variant="outlined"
                                    />
                                );
                            })
                        ) : (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                No Groups
                            </Typography>
                        )}

                        {/* תצוגת היתרה אם יש יותר מ-2 קבוצות */}
                        {hiddenGroupsCount > 0 && (
                            <Chip
                                label={`+${hiddenGroupsCount}`}
                                size="small"
                                color="default"
                                sx={{ fontWeight: "bold", minWidth: 30 }}
                            />
                        )}
                    </Box>
                </TableCell>

                {/* 4. Created */}
                <TableCell>{formatDate(user.createdAt)}</TableCell>

                {/* 5. Last Login */}
                <TableCell>{getLastLoginDisplay(user.lastLogin)}</TableCell>

                {/* 6. Status */}
                <TableCell>
                    <Chip
                        label={user.isActive ? "Active" : "Inactive"}
                        color={user.isActive ? "success" : "default"}
                        size="small"
                    />
                </TableCell>

                {/* 7. Actions */}
                <TableCell align="center">
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={() => onEdit(rawUser)}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    {!isSuperAdmin && (
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                color="error"
                                onClick={() => onDelete(rawUser)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </TableCell>
            </TableRow>
        );
    };

    // --- Group Row Render ---
    const renderGroupRow = (rawGroup: Group) => {
        const group = rawGroup as unknown as ExtendedGroup;
        const isSystemGroup = group.name === "administrators";
        const groupId = group._id || group.id;

        // חישוב מספר המשתמשים בקבוצה בזמן אמת (מתוך רשימת המשתמשים הכללית)
        const userCount = users.filter((u) =>
            u.groups?.some((g) => g.groupId === groupId),
        ).length;

        // האם ניתן למחוק? (לא קבוצת מערכת וגם אין משתמשים)
        const canDelete = !isSystemGroup && userCount === 0;

        return (
            <TableRow key={groupId} hover>
                <TableCell>{group.name}</TableCell>

                {/* <TableCell>{userCount}</TableCell> */}
                <TableCell>
                    {userCount === 0 ? (
                        <Typography variant="body2" color="error">
                            0
                        </Typography>
                    ) : (
                        userCount
                    )}
                </TableCell>

                <TableCell>{formatDate(group.createdAt)}</TableCell>

                <TableCell align="center">
                    {!isSystemGroup && (
                        <>
                            <Tooltip title="Edit">
                                <IconButton
                                    size="small"
                                    onClick={() => onEdit(rawGroup)}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>

                            {/* כפתור מחיקה עם הגנה ו-Tooltip */}
                            <Tooltip
                                title={
                                    !canDelete
                                        ? "Cannot delete group with active members"
                                        : "Delete"
                                }
                            >
                                <span>
                                    {" "}
                                    {/* Span wrapper required for Tooltip on disabled button */}
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => onDelete(rawGroup)}
                                        disabled={!canDelete}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </span>
                            </Tooltip>
                        </>
                    )}
                </TableCell>
            </TableRow>
        );
    };

    return (
        <TableContainer
            component={Paper}
            sx={{ maxHeight: "70vh", overflowY: "auto" }}
        >
            <Table stickyHeader>
                <TableHead>
                    <TableRow>
                        {viewMode === "users" ? (
                            <>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    System ID
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Name
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Groups
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Created
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Last Login
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Status
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                    align="center"
                                >
                                    Actions
                                </TableCell>
                            </>
                        ) : (
                            <>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Group Name
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    User Count
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                >
                                    Created
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: headerBgColor,
                                        fontWeight: "bold",
                                    }}
                                    align="center"
                                >
                                    Actions
                                </TableCell>
                            </>
                        )}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {viewMode === "users"
                        ? users.map(renderUserRow)
                        : groups.map(renderGroupRow)}

                    {((viewMode === "users" && users.length === 0) ||
                        (viewMode === "groups" && groups.length === 0)) && (
                        <TableRow>
                            <TableCell
                                colSpan={5}
                                align="center"
                                sx={{ py: 3 }}
                            >
                                No {viewMode} found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
