import { useState } from "react";
import {
    AppBar,
    Toolbar,
    Typography,
    Button,
    Box,
    IconButton,
    Avatar,
    Menu,
    MenuItem,
    Divider,
    ListItemIcon,
    Tooltip,
    Badge,
} from "@mui/material";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import { useTheme } from "@mui/material/styles";
import { useColorMode } from "../context/ThemeContext";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import Logout from "@mui/icons-material/Logout";
import GroupsIcon from "@mui/icons-material/Groups";
import CheckIcon from "@mui/icons-material/Check";
import SettingsIcon from "@mui/icons-material/Settings";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import AboutDialog from "./AboutDialog";

export default function Navbar() {
    const { user, currentGroup, isAdmin, isShiftManager, logout, switchGroup } =
        useUser();
    const { groups } = useData();
    const navigate = useNavigate();
    const theme = useTheme();
    const { toggleColorMode, mode } = useColorMode();

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const [aboutOpen, setAboutOpen] = useState(false);

    const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = () => {
        handleClose();
        logout();
        navigate("/login");
    };

    const handleGroupSwitch = (groupId: string) => {
        switchGroup(groupId);
        handleClose();
        navigate("/");
    };

    const getGroupName = (groupId: string) => {
        if (!groups || groups.length === 0) return "Loading...";
        const group = groups.find((g) => (g._id || g.id) === groupId);
        return group ? group.name.toUpperCase() : "Unknown Group";
    };

    if (!user) return null;

    return (
        <>
            <AppBar position="static" color="default" elevation={1}>
                <Toolbar>
                    <Box
                        component={RouterLink}
                        to="/"
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            textDecoration: "none",
                            color: "inherit",
                            mr: 3,
                        }}
                    >
                        <Box
                            component="img"
                            src="/hunting-lodge-image.jpg"
                            alt="Logo"
                            sx={{
                                height: 50,
                                width: "auto",
                                mr: 2,
                                borderRadius: 1,
                            }}
                        />
                        <Typography
                            variant="h6"
                            component="div"
                            sx={{
                                fontWeight: "bold",
                                color: theme.palette.primary.main,
                            }}
                        >
                            HUNTING LODGE
                        </Typography>
                    </Box>

                    <Box sx={{ flexGrow: 1, display: "flex", gap: 2 }}>
                        <Button component={RouterLink} to="/" color="inherit">
                            Sites
                        </Button>
                        {/* TactiSites Link Removed */}
                        <Button
                            component={RouterLink}
                            to="/phones"
                            color="inherit"
                        >
                            Phones
                        </Button>

                        <Button
                            component={RouterLink}
                            to="/schedule"
                            color="inherit"
                        >
                            Schedule
                        </Button>
                        <Button
                            component={RouterLink}
                            to="/reports"
                            color="inherit"
                        >
                            Reports
                        </Button>

                        {(isShiftManager || isAdmin) && currentGroup && (
                            <Tooltip title="Group Settings">
                                <Button
                                    component={RouterLink}
                                    to="/group-settings"
                                    color="inherit"
                                    sx={{ minWidth: "auto", px: 1 }}
                                >
                                    <SettingsIcon />
                                </Button>
                            </Tooltip>
                        )}

                        {isAdmin && (
                            <Button
                                component={RouterLink}
                                to="/admin/users"
                                color="error"
                            >
                                Users & Groups
                            </Button>
                        )}
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center" }}>
                        <Tooltip title="About & Support">
                            <IconButton
                                onClick={() => setAboutOpen(true)}
                                color="inherit"
                            >
                                <HelpOutlineIcon />
                            </IconButton>
                        </Tooltip>

                        <Tooltip
                            title={
                                mode === "dark"
                                    ? "Switch to Light Mode"
                                    : "Switch to Dark Mode"
                            }
                        >
                            <IconButton
                                sx={{ ml: 1 }}
                                onClick={toggleColorMode}
                                color="inherit"
                            >
                                {theme.palette.mode === "dark" ? (
                                    <Brightness7Icon />
                                ) : (
                                    <Brightness4Icon />
                                )}
                            </IconButton>
                        </Tooltip>

                        <IconButton
                            onClick={handleMenuClick}
                            size="small"
                            sx={{ ml: 2 }}
                        >
                            <Badge
                                color="secondary"
                                variant="dot"
                                invisible={!isShiftManager}
                            >
                                <Avatar
                                    sx={{
                                        width: 32,
                                        height: 32,
                                        bgcolor: isAdmin
                                            ? "#d32f2f"
                                            : theme.palette.primary.main,
                                    }}
                                >
                                    {user.username.charAt(0).toUpperCase()}
                                </Avatar>
                            </Badge>
                        </IconButton>
                    </Box>

                    <Menu
                        anchorEl={anchorEl}
                        id="account-menu"
                        open={open}
                        onClose={handleClose}
                        onClick={undefined}
                        PaperProps={{
                            elevation: 0,
                            sx: {
                                overflow: "visible",
                                filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.32))",
                                mt: 1.5,
                                minWidth: 200,
                                bgcolor: "background.paper",
                            },
                        }}
                        transformOrigin={{
                            horizontal: "right",
                            vertical: "top",
                        }}
                        anchorOrigin={{
                            horizontal: "right",
                            vertical: "bottom",
                        }}
                    >
                        <MenuItem
                            disabled
                            sx={{
                                opacity: "1 !important",
                                fontWeight: "bold",
                                color: "text.primary",
                            }}
                        >
                            Hi, {user.username}
                        </MenuItem>

                        {!user.isActive && (
                            <MenuItem
                                disabled
                                sx={{ color: "error.main", fontSize: "0.8rem" }}
                            >
                                (Inactive User)
                            </MenuItem>
                        )}

                        <Divider />

                        <MenuItem
                            disabled
                            sx={{
                                opacity: "1 !important",
                                fontSize: "0.85rem",
                            }}
                        >
                            Switch Group:
                        </MenuItem>

                        {user.groups.map((membership) => {
                            const groupId = membership.groupId;
                            const isActive =
                                (currentGroup?._id || currentGroup?.id) ===
                                groupId;

                            return (
                                <MenuItem
                                    key={groupId}
                                    onClick={() => handleGroupSwitch(groupId)}
                                    selected={isActive}
                                    sx={{
                                        fontWeight: isActive
                                            ? "bold"
                                            : "normal",
                                    }}
                                >
                                    <ListItemIcon>
                                        {isActive ? (
                                            <CheckIcon
                                                fontSize="small"
                                                color="primary"
                                            />
                                        ) : (
                                            <GroupsIcon fontSize="small" />
                                        )}
                                    </ListItemIcon>
                                    {getGroupName(groupId)}

                                    {membership.role === "shift_manager" && (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                ml: 1,
                                                color: "secondary.main",
                                            }}
                                        >
                                            (M)
                                        </Typography>
                                    )}
                                </MenuItem>
                            );
                        })}

                        <Divider />

                        <MenuItem
                            onClick={handleLogout}
                            sx={{ color: "error.main" }}
                        >
                            <ListItemIcon>
                                <Logout fontSize="small" color="error" />
                            </ListItemIcon>
                            Logout
                        </MenuItem>
                    </Menu>
                </Toolbar>
            </AppBar>

            <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
        </>
    );
}
