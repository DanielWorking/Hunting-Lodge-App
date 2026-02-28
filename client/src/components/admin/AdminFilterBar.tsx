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

interface AdminFilterBarProps {
    viewMode: "users" | "groups";
    onViewModeChange: (mode: "users" | "groups") => void;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    onAddClick: () => void;
}

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
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: "center",
                mb: 4,
                gap: 2,
                bgcolor: "background.paper",
                p: 2,
                borderRadius: 2,
                boxShadow: 1,
            }}
        >
            <ToggleButtonGroup
                color="primary"
                value={viewMode}
                exclusive
                onChange={(_, newMode) => {
                    if (newMode) onViewModeChange(newMode);
                }}
                size="small"
            >
                <ToggleButton value="users" sx={{ px: 3 }}>
                    <PersonIcon sx={{ mr: 1 }} /> Users
                </ToggleButton>
                <ToggleButton value="groups" sx={{ px: 3 }}>
                    <GroupIcon sx={{ mr: 1 }} /> Groups
                </ToggleButton>
            </ToggleButtonGroup>

            <TextField
                placeholder={
                    viewMode === "users"
                        ? "Search Users..."
                        : "Search Groups..."
                }
                size="small"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                sx={{ flexGrow: 1, maxWidth: { xs: "100%", sm: "400px" } }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon color="action" />
                        </InputAdornment>
                    ),
                }}
            />

            <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={onAddClick}
            >
                Add {viewMode === "users" ? "User" : "Group"}
            </Button>
        </Box>
    );
}
