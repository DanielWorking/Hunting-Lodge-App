/**
 * @module AdminTable
 *
 * Renders a data table for administrative oversight, supporting two distinct view modes:
 * Users and Groups. Provides real-time metrics, status indicators, and management actions.
 */

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

import type { User, Group } from "../../types";

/**
 * Extension of the User type to include administrative metadata
 * and creation timestamps for UI display.
 */
type ExtendedUser = User & {
    isAdmin?: boolean;
    isShiftManager?: boolean;
    createdAt?: string | Date;
};

/**
 * Extension of the Group type to include creation timestamps for UI display.
 */
type ExtendedGroup = Group & {
    createdAt?: string | Date;
};

/**
 * Configuration properties for the {@link AdminTable} component.
 */
interface AdminTableProps {
    /** The active data view mode. */
    viewMode: "users" | "groups";
    /** The filtered list of users to display. */
    users: User[];
    /** The filtered list of groups to display. */
    groups: Group[];
    /** The master list of all groups, used for membership resolution. */
    allGroups: Group[];
    /** The master list of all users, used for population metrics. */
    allUsers: User[];
    /** Callback triggered when an item's edit action is invoked. */
    onEdit: (item: User | Group) => void;
    /** Callback triggered when an item's delete action is invoked. */
    onDelete: (item: User | Group) => void;
}

/**
 * Renders a standardized table for managing application resources (Users/Groups).
 *
 * Features dynamic header rendering, sticky headers for large datasets, 
 * and specialized row decorators for system-critical entities.
 *
 * @param {AdminTableProps} props  The properties for the component.
 * @returns {JSX.Element}           The rendered table component.
 */
export default function AdminTable({
    viewMode,
    users,
    groups,
    allGroups,
    allUsers,
    onEdit,
    onDelete,
}: AdminTableProps) {
    const theme = useTheme();

    /** The background color for the sticky table header, adapted for light/dark modes. */
    const headerBgColor =
        theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f5";

    /**
     * Formats a date string into a localized short date format (DD/MM/YYYY).
     * 
     * @param {string | Date} [dateString]  The date to format.
     * @returns {string}                    The formatted date or "-" if null.
     */
    const formatDate = (dateString?: string | Date) => {
        if (!dateString) return "-";
        return new Date(dateString).toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
    };

    /**
     * Renders a human-readable "Last Login" indicator.
     * Flags accounts as "Never" logged in if data is missing or stale (over 90 days).
     * 
     * @param {string} [dateString]  The timestamp of the last login.
     * @returns {JSX.Element | string} The rendered status element.
     */
    const getLastLoginDisplay = (dateString?: string) => {
        // Handle missing login data
        if (!dateString) {
            return (
                <Typography variant="body2" color="error" fontWeight="bold">
                    Never
                </Typography>
            );
        }

        const date = new Date(dateString);

        // Handle malformed date strings
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

        const formatted = date.toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });

        // Flag accounts with no activity in the last 90 days
        if (diffDays > 90) {
            return (
                <Typography variant="body2" color="error" fontWeight="bold">
                    {formatted}
                </Typography>
            );
        }

        return formatted;
    };

    /**
     * Renders a single row for the User management view.
     * 
     * @param {User} rawUser  The user data to render.
     * @returns {JSX.Element}  The rendered table row.
     */
    const renderUserRow = (rawUser: User) => {
        const user = rawUser as unknown as ExtendedUser;
        const superAdminId = import.meta.env.VITE_SUPER_ADMIN_ID;
        const isSuperAdmin = user.username === superAdminId;

        /**
         * Filter out memberships to groups that no longer exist (ghost groups).
         * This ensures the UI doesn't count or display defunct references.
         */
        const validUserGroups = (user.groups || []).filter((g) =>
            allGroups.some((grp) => (grp._id || grp.id) === g.groupId),
        );

        // Limit initial display to 2 groups to preserve row height
        const visibleGroups = validUserGroups.slice(0, 2);
        const hiddenGroupsCount = validUserGroups.length - 2;

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

                        {/* Display an overflow counter if the user belongs to many groups */}
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

                {/* 4. Created Timestamp */}
                <TableCell>{formatDate(user.createdAt)}</TableCell>

                {/* 5. Last Activity */}
                <TableCell>{getLastLoginDisplay(user.lastLogin)}</TableCell>

                {/* 6. Account Status */}
                <TableCell>
                    <Chip
                        label={user.isActive ? "Active" : "Inactive"}
                        color={user.isActive ? "success" : "default"}
                        size="small"
                    />
                </TableCell>

                {/* 7. Management Actions */}
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

    /**
     * Renders a single row for the Group management view.
     * 
     * @param {Group} rawGroup  The group data to render.
     * @returns {JSX.Element}   The rendered table row.
     */
    const renderGroupRow = (rawGroup: Group) => {
        const group = rawGroup as unknown as ExtendedGroup;
        const isSystemGroup =
            group.name === import.meta.env.VITE_SUPER_ADMIN_GROUP_NAME;
        const groupId = group._id || group.id;

        /**
         * Calculate user population for this group in real-time.
         */
        const userCount = allUsers.filter((u) =>
            u.groups?.some((g) => g.groupId === groupId),
        ).length;

        /**
         * Groups can only be deleted if they are not system-protected 
         * and have no assigned members.
         */
        const canDelete = !isSystemGroup && userCount === 0;

        return (
            <TableRow key={groupId} hover>
                <TableCell>{group.name}</TableCell>

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
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={() => onEdit(rawGroup)}
                        >
                            <EditIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    {/* Deletion is disabled for system groups or populated groups */}
                    {!isSystemGroup && (
                        <Tooltip
                            title={
                                !canDelete
                                    ? "Cannot delete group with active members"
                                    : "Delete"
                            }
                        >
                            <span>
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
                                colSpan={7}
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
