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

    // --- User Row Render ---
    const renderUserRow = (rawUser: User) => {
        const user = rawUser as unknown as ExtendedUser;

        const currentName = user.username.toLowerCase();
        const superAdminName = (
            import.meta.env.VITE_SUPER_ADMIN_USERNAME || "Super Admin"
        ).toLowerCase();

        const isSuperAdmin = currentName === superAdminName;

        return (
            <TableRow key={user._id || user.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>
                    <Box display="flex" flexDirection="column">
                        {/* השם לתצוגה בגדול */}
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                            {user.displayName || user.username}
                        </Typography>
                    </Box>
                </TableCell>
                <TableCell>
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                        {user.groups && user.groups.length > 0 ? (
                            user.groups.map((g, idx) => {
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
                    </Box>
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell>
                    <Chip
                        label={user.isActive ? "Active" : "Inactive"}
                        color={user.isActive ? "success" : "default"}
                        size="small"
                    />
                </TableCell>
                <TableCell align="center">
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={() => onEdit(rawUser)}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    {/* המחיקה מוסתרת לחלוטין אם זה Super Admin */}
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
        // בדיקה שאינה רגישה לאותיות גדולות/קטנות
        const isSystemGroup = group.name.toLowerCase() === "administrators";

        return (
            <TableRow key={group._id || group.id} hover>
                <TableCell sx={{ fontWeight: "bold" }}>{group.name}</TableCell>
                <TableCell>{formatDate(group.createdAt)}</TableCell>
                <TableCell align="center">
                    {/* הסתרת כפתורי עריכה ומחיקה לקבוצת המערכת */}
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
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => onDelete(rawGroup)}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
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
                                    Username
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
