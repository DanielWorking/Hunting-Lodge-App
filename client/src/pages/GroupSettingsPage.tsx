import { useState } from "react";
import { Container, Typography, Box, Tabs, Tab, Paper } from "@mui/material";
import { useUser } from "../context/UserContext";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ViewListIcon from "@mui/icons-material/ViewList";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart"; // אייקון לסטטיסטיקות

// ייבוא הרכיבים
import ShiftTypesTab from "../components/settings/ShiftTypesTab";
import TimeSlotsTab from "../components/settings/TimeSlotsTab";
import MembersTab from "../components/settings/MembersTab";
import StatisticsTab from "../components/settings/StatisticsTab"; // <-- הוספנו את זה

export default function GroupSettingsPage() {
    const { currentGroup, isShiftManager, isAdmin } = useUser();
    const [tabValue, setTabValue] = useState(0);

    if (!currentGroup || (!isShiftManager && !isAdmin)) {
        return (
            <Container sx={{ mt: 4, textAlign: "center" }}>
                <Typography variant="h5" color="error">
                    Access Denied. You must be a Shift Manager.
                </Typography>
            </Container>
        );
    }

    const handleTabChange = (
        _event: React.SyntheticEvent,
        newValue: number
    ) => {
        setTabValue(newValue);
    };

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    {currentGroup.name.toUpperCase()} Settings
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Configure shift types, report times, and manage member
                    vacations.
                </Typography>
            </Box>

            <Paper sx={{ width: "100%", mb: 2 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    indicatorColor="primary"
                    textColor="primary"
                    variant="fullWidth"
                >
                    <Tab icon={<ViewListIcon />} label="Shift Types" />
                    <Tab icon={<AccessTimeIcon />} label="Time Slots" />
                    <Tab icon={<PeopleIcon />} label="Members & Order" />
                    {/* הטאב החדש */}
                    <Tab icon={<BarChartIcon />} label="Statistics" />
                </Tabs>

                <Box sx={{ bgcolor: "background.paper", minHeight: 400 }}>
                    {tabValue === 0 && <ShiftTypesTab />}
                    {tabValue === 1 && <TimeSlotsTab />}
                    {tabValue === 2 && <MembersTab />}
                    {tabValue === 3 && <StatisticsTab />}
                </Box>
            </Paper>
        </Container>
    );
}
