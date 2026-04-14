/**
 * @module AdminFilterBar
 *
 * Provides a specialized toolbar for the administrative dashboard.
 * Includes view switching between users and groups, integrated search functionality,
 * and context-aware action buttons for resource creation.
 */

import {
    Box,
    ToggleButton,
    ToggleButtonGroup,
    TextField,
    Button,
    InputAdornment,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";

/**
 * Props for the {@link AdminFilterBar} component.
 */
interface AdminFilterBarProps {
    /** The currently selected administrative view. */
    viewMode: "users" | "groups";
    /** Callback triggered when the user switches the active view. */
    onViewModeChange: (mode: "users" | "groups") => void;
    /** The current search query string. */
    searchTerm: string;
    /** Callback triggered whenever the search input changes. */
    onSearchChange: (value: string) => void;
    /** Callback triggered when the 'Add Group' action is initiated. */
    onAddClick: () => void;
}

/**
 * Renders a responsive filter and action bar for administrative management.
 *
 * Features a balanced three-column layout on desktop:
 * - Left: View toggle (Users/Groups)
 * - Center: Real-time search input
 * - Right: Contextual 'Add' action
 *
 * @param {AdminFilterBarProps} props  The properties for the component.
 * @returns {JSX.Element}               The rendered filter bar component.
 */
export default function AdminFilterBar({
    viewMode,
    onViewModeChange,
    searchTerm,
    onSearchChange,
    onAddClick,
}: AdminFilterBarProps) {
    return (
        <Box
            sx={{
                display: "grid",
                // Balanced three-column distribution for desktop screens
                gridTemplateColumns: { xs: "1fr", sm: "1fr auto 1fr" },
                gap: 2,
                alignItems: "center",
                mb: 4,
                bgcolor: "background.paper",
                p: 2,
                borderRadius: 2,
                boxShadow: 1,
            }}
        >
            {/* Left Section: View Toggle buttons */}
            <Box sx={{ justifySelf: { xs: "center", sm: "start" } }}>
                <ToggleButtonGroup
                    color="primary"
                    value={viewMode}
                    exclusive
                    onChange={(_, newMode) => {
                        if (newMode) onViewModeChange(newMode);
                    }}
                    aria-label="Platform"
                    size="small"
                >
                    <ToggleButton value="users" sx={{ px: 3 }}>
                        <PersonIcon sx={{ mr: 1 }} /> Users
                    </ToggleButton>
                    <ToggleButton value="groups" sx={{ px: 3 }}>
                        <GroupIcon sx={{ mr: 1 }} /> Groups
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Center Section: Search field (Always centered for balance) */}
            <TextField
                placeholder={
                    viewMode === "users"
                        ? "Search Users..."
                        : "Search Groups..."
                }
                size="small"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                sx={{
                    width: "100%",
                    maxWidth: "400px",
                    justifySelf: "center",
                }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon color="action" />
                        </InputAdornment>
                    ),
                }}
            />

            {/* Right Section: Action buttons (Contextual for Groups) */}
            <Box sx={{ justifySelf: { xs: "center", sm: "end" } }}>
                {viewMode === "groups" && (
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={onAddClick}
                    >
                        Add Group
                    </Button>
                )}
            </Box>
        </Box>
    );
}
