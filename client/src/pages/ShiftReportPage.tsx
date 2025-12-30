import { useState, useEffect } from "react";
import {
    Container,
    Paper,
    Typography,
    List,
    ListItemButton,
    ListItemText,
    Box,
    TextField,
    Button,
    Divider,
    Chip,
    Collapse,
    IconButton,
    Autocomplete,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import SaveIcon from "@mui/icons-material/Save";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import UndoIcon from "@mui/icons-material/Undo";

import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import axios from "axios";
import { format } from "date-fns";
import ThinkingLoader from "../components/ThinkingLoader";

export default function ShiftReportPage() {
    const { currentGroup } = useUser();
    const { showNotification } = useNotification();
    const { users, groups } = useData();

    const [reports, setReports] = useState<any[]>([]);
    const [selectedReport, setSelectedReport] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const [openYears, setOpenYears] = useState<{ [key: string]: boolean }>({});
    const [openMonths, setOpenMonths] = useState<{ [key: string]: boolean }>(
        {}
    );
    const [openDays, setOpenDays] = useState<{ [key: string]: boolean }>({});

    const [deleteReportId, setDeleteReportId] = useState<string | null>(null);

    const groupUsers = users.filter((u) =>
        u.groups.some(
            (g) => g.groupId === (currentGroup?._id || currentGroup?.id)
        )
    );

    useEffect(() => {
        if (currentGroup) {
            fetchReports();
        }
    }, [currentGroup]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const res = await axios.get("/api/reports", {
                params: { groupId: currentGroup?._id || currentGroup?.id },
            });
            setReports(res.data);

            if (res.data.length > 0 && !selectedReport) {
                setSelectedReport(res.data[0]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // === לוגיקה חכמה לזיהוי משמרת נוכחית ===
    const findCurrentTimeSlot = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMinute;

        const groupSettings = groups.find(
            (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id)
        )?.settings;
        const timeSlots = groupSettings?.timeSlots || [];

        return timeSlots.find((slot) => {
            if (!slot.startTime || !slot.endTime) return false;
            const [startH, startM] = slot.startTime.split(":").map(Number);
            const [endH, endM] = slot.endTime.split(":").map(Number);

            const startVal = startH * 60 + startM;
            const endVal = endH * 60 + endM;

            // טיפול במשמרת לילה שחוצה יום (למשל 23:00 עד 07:00)
            if (endVal < startVal) {
                return currentTimeVal >= startVal || currentTimeVal <= endVal;
            }
            // משמרת רגילה באותו יום
            return currentTimeVal >= startVal && currentTimeVal <= endVal;
        });
    };

    const handleCreateReport = async () => {
        if (!currentGroup) return;

        const now = new Date();
        const currentSlot = findCurrentTimeSlot();

        let title = `Shift Report - ${format(now, "dd/MM/yyyy HH:mm")}`;
        let startTime = now;
        let endTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // ברירת מחדל: +8 שעות

        // === חישוב זמנים חכם אם נמצאה משמרת מוגדרת ===
        if (currentSlot) {
            title = `${currentSlot.name} - ${format(now, "dd/MM/yyyy")}`;

            // ניתוח שעות מההגדרות
            const [startH, startM] = currentSlot.startTime
                .split(":")
                .map(Number);
            const [endH, endM] = currentSlot.endTime.split(":").map(Number);

            // קביעת זמן התחלה מדויק להיום
            const calculatedStart = new Date(now);
            calculatedStart.setHours(startH, startM, 0, 0);

            // קביעת זמן סיום
            const calculatedEnd = new Date(now);
            calculatedEnd.setHours(endH, endM, 0, 0);

            // אם שעת הסיום קטנה משעת ההתחלה -> סימן שזה מחר!
            // (למשל התחיל ב-20:00 ונגמר ב-08:00)
            if (endH < startH || (endH === startH && endM < startM)) {
                calculatedEnd.setDate(calculatedEnd.getDate() + 1);
            }

            startTime = calculatedStart;
            endTime = calculatedEnd;
        }

        try {
            const res = await axios.post("/api/reports", {
                groupId: currentGroup._id || currentGroup.id,
                title,
                startTime,
                endTime,
            });

            const newReport = res.data;
            setReports([newReport, ...reports]);
            setSelectedReport(newReport);

            const workersCount = newReport.attendees?.length || 0;
            showNotification(
                `New Report Created! (${workersCount} workers added)`,
                "success"
            );
        } catch (error) {
            showNotification("Error creating report", "error");
        }
    };

    const handleSaveReport = async () => {
        if (!selectedReport) return;
        try {
            await axios.put(`/api/reports/${selectedReport._id}`, {
                currentTasks: selectedReport.currentTasks,
                previousTasks: selectedReport.previousTasks,
                attendees: selectedReport.attendees,
            });
            showNotification("Report saved successfully", "success");
            setReports((prev) =>
                prev.map((r) =>
                    r._id === selectedReport._id ? selectedReport : r
                )
            );
        } catch (error) {
            showNotification("Error saving report", "error");
        }
    };

    const handleDiscardChanges = () => {
        const original = reports.find((r) => r._id === selectedReport._id);
        if (original) {
            setSelectedReport({ ...original });
            showNotification("Changes discarded", "info");
        }
    };

    const handleDeleteReport = async () => {
        if (!deleteReportId) return;
        try {
            await axios.delete(`/api/reports/${deleteReportId}`);
            setReports((prev) => prev.filter((r) => r._id !== deleteReportId));
            if (selectedReport?._id === deleteReportId) setSelectedReport(null);
            showNotification("Report deleted", "success");
        } catch (error) {
            showNotification("Error deleting", "error");
        } finally {
            setDeleteReportId(null);
        }
    };

    const handleAttendanceChange = (_event: any, newValue: any[]) => {
        if (!selectedReport) return;
        const newAttendees = newValue.map((u) => ({
            userId: u._id || u.id,
            name: u.username,
            isManual: true,
        }));
        setSelectedReport({ ...selectedReport, attendees: newAttendees });
    };

    // ארגון העץ
    const organizedReports = reports.reduce((acc: any, report) => {
        const date = new Date(report.startTime);
        const year = date.getFullYear();
        const month = date.toLocaleString("default", { month: "long" });
        const day = format(date, "dd/MM/yyyy");

        if (!acc[year]) acc[year] = {};
        if (!acc[year][month]) acc[year][month] = {};
        if (!acc[year][month][day]) acc[year][month][day] = [];

        acc[year][month][day].push(report);
        return acc;
    }, {});

    const toggleYear = (year: string) =>
        setOpenYears((prev) => ({ ...prev, [year]: !prev[year] }));
    const toggleMonth = (key: string) =>
        setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }));
    const toggleDay = (key: string) =>
        setOpenDays((prev) => ({ ...prev, [key]: !prev[key] }));

    if (!currentGroup)
        return (
            <Container>
                <Typography>Please select a group.</Typography>
            </Container>
        );

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4, height: "80vh" }}>
            <Grid container spacing={2} sx={{ height: "100%" }}>
                {/* Sidebar */}
                <Grid size={{ xs: 3 }} sx={{ height: "100%" }}>
                    <Paper
                        sx={{
                            height: "100%",
                            overflowY: "auto",
                            p: 2,
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <Box
                            display="flex"
                            justifyContent="space-between"
                            alignItems="center"
                            mb={2}
                        >
                            <Typography variant="h6" fontWeight="bold">
                                Reports Archive
                            </Typography>
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={handleCreateReport}
                            >
                                New
                            </Button>
                        </Box>
                        <Divider sx={{ mb: 2 }} />

                        {loading && (
                            <ThinkingLoader
                                size={24}
                                sx={{ alignSelf: "center", mt: 2 }}
                            />
                        )}

                        <List component="nav" sx={{ flexGrow: 1 }}>
                            {Object.keys(organizedReports)
                                .sort()
                                .reverse()
                                .map((year) => (
                                    <Box key={year}>
                                        <ListItemButton
                                            onClick={() => toggleYear(year)}
                                        >
                                            <ListItemText
                                                primary={year}
                                                primaryTypographyProps={{
                                                    fontWeight: "bold",
                                                }}
                                            />
                                            {openYears[year] ? (
                                                <ExpandLess />
                                            ) : (
                                                <ExpandMore />
                                            )}
                                        </ListItemButton>

                                        <Collapse
                                            in={openYears[year]}
                                            timeout="auto"
                                            unmountOnExit
                                        >
                                            <List
                                                component="div"
                                                disablePadding
                                            >
                                                {Object.keys(
                                                    organizedReports[year]
                                                ).map((month) => {
                                                    const monthKey = `${year}-${month}`;
                                                    return (
                                                        <Box
                                                            key={monthKey}
                                                            sx={{ pl: 1 }}
                                                        >
                                                            <ListItemButton
                                                                onClick={() =>
                                                                    toggleMonth(
                                                                        monthKey
                                                                    )
                                                                }
                                                            >
                                                                <ListItemText
                                                                    primary={
                                                                        month
                                                                    }
                                                                />
                                                                {openMonths[
                                                                    monthKey
                                                                ] ? (
                                                                    <ExpandLess />
                                                                ) : (
                                                                    <ExpandMore />
                                                                )}
                                                            </ListItemButton>

                                                            <Collapse
                                                                in={
                                                                    openMonths[
                                                                        monthKey
                                                                    ]
                                                                }
                                                                timeout="auto"
                                                                unmountOnExit
                                                            >
                                                                <List
                                                                    component="div"
                                                                    disablePadding
                                                                >
                                                                    {Object.keys(
                                                                        organizedReports[
                                                                            year
                                                                        ][month]
                                                                    ).map(
                                                                        (
                                                                            day
                                                                        ) => {
                                                                            const dayKey = `${monthKey}-${day}`;
                                                                            return (
                                                                                <Box
                                                                                    key={
                                                                                        dayKey
                                                                                    }
                                                                                    sx={{
                                                                                        pl: 2,
                                                                                    }}
                                                                                >
                                                                                    <ListItemButton
                                                                                        onClick={() =>
                                                                                            toggleDay(
                                                                                                dayKey
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <ListItemText
                                                                                            primary={
                                                                                                day
                                                                                            }
                                                                                        />
                                                                                        {openDays[
                                                                                            dayKey
                                                                                        ] ? (
                                                                                            <ExpandLess />
                                                                                        ) : (
                                                                                            <ExpandMore />
                                                                                        )}
                                                                                    </ListItemButton>

                                                                                    <Collapse
                                                                                        in={
                                                                                            openDays[
                                                                                                dayKey
                                                                                            ]
                                                                                        }
                                                                                        timeout="auto"
                                                                                        unmountOnExit
                                                                                    >
                                                                                        <List
                                                                                            component="div"
                                                                                            disablePadding
                                                                                        >
                                                                                            {organizedReports[
                                                                                                year
                                                                                            ][
                                                                                                month
                                                                                            ][
                                                                                                day
                                                                                            ].map(
                                                                                                (
                                                                                                    rep: any
                                                                                                ) => (
                                                                                                    <ListItemButton
                                                                                                        key={
                                                                                                            rep._id
                                                                                                        }
                                                                                                        sx={{
                                                                                                            pl: 3,
                                                                                                            bgcolor:
                                                                                                                selectedReport?._id ===
                                                                                                                rep._id
                                                                                                                    ? "action.selected"
                                                                                                                    : "inherit",
                                                                                                        }}
                                                                                                        onClick={() =>
                                                                                                            setSelectedReport(
                                                                                                                rep
                                                                                                            )
                                                                                                        }
                                                                                                    >
                                                                                                        <ListItemText
                                                                                                            primary={
                                                                                                                rep.title
                                                                                                            }
                                                                                                        />
                                                                                                        <IconButton
                                                                                                            size="small"
                                                                                                            onClick={(
                                                                                                                e
                                                                                                            ) => {
                                                                                                                e.stopPropagation();
                                                                                                                setDeleteReportId(
                                                                                                                    rep._id
                                                                                                                );
                                                                                                            }}
                                                                                                            sx={{
                                                                                                                opacity: 0.6,
                                                                                                                "&:hover":
                                                                                                                    {
                                                                                                                        opacity: 1,
                                                                                                                        color: "error.main",
                                                                                                                    },
                                                                                                            }}
                                                                                                        >
                                                                                                            <DeleteIcon fontSize="small" />
                                                                                                        </IconButton>
                                                                                                    </ListItemButton>
                                                                                                )
                                                                                            )}
                                                                                        </List>
                                                                                    </Collapse>
                                                                                </Box>
                                                                            );
                                                                        }
                                                                    )}
                                                                </List>
                                                            </Collapse>
                                                        </Box>
                                                    );
                                                })}
                                            </List>
                                        </Collapse>
                                    </Box>
                                ))}
                        </List>
                    </Paper>
                </Grid>

                {/* Content (RTL) */}
                <Grid size={{ xs: 9 }} sx={{ height: "100%" }}>
                    {selectedReport ? (
                        <Paper
                            sx={{
                                height: "100%",
                                p: 4,
                                overflowY: "auto",
                                direction: "rtl",
                            }}
                        >
                            <Box
                                display="flex"
                                justifyContent="space-between"
                                alignItems="center"
                                mb={3}
                                sx={{ direction: "ltr" }}
                            >
                                <Typography variant="h4" fontWeight="bold">
                                    {selectedReport.title}
                                </Typography>
                                <Box>
                                    <Button
                                        variant="outlined"
                                        startIcon={<UndoIcon />}
                                        onClick={handleDiscardChanges}
                                        disabled={selectedReport.isLocked}
                                        sx={{ mr: 2 }}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        variant="contained"
                                        startIcon={<SaveIcon />}
                                        onClick={handleSaveReport}
                                        disabled={selectedReport.isLocked}
                                    >
                                        Save Report
                                    </Button>
                                </Box>
                            </Box>

                            <Divider sx={{ mb: 3 }} />

                            <Box
                                mb={4}
                                sx={{
                                    bgcolor: "action.hover",
                                    p: 3,
                                    borderRadius: 2,
                                    borderRight: "4px solid",
                                    borderColor: "warning.main",
                                }}
                            >
                                <Typography
                                    variant="subtitle2"
                                    color="text.secondary"
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    משימות ממשמרת קודמת (Previous Tasks)
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    variant="standard"
                                    value={selectedReport.previousTasks}
                                    onChange={(e) =>
                                        setSelectedReport({
                                            ...selectedReport,
                                            previousTasks: e.target.value,
                                        })
                                    }
                                    disabled={selectedReport.isLocked}
                                    placeholder="אין משימות ממשמרת קודמת"
                                    sx={{
                                        "& .MuiInputBase-root": {
                                            fontSize: "1rem",
                                        },
                                    }}
                                />
                            </Box>

                            <Box mb={4}>
                                <Typography
                                    variant="h6"
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    נוכחות במשמרת (Attendance)
                                </Typography>
                                <Autocomplete
                                    multiple
                                    options={groupUsers}
                                    getOptionLabel={(option) => option.username}
                                    value={selectedReport.attendees
                                        .map((a: any) =>
                                            groupUsers.find(
                                                (u) =>
                                                    (u._id || u.id) === a.userId
                                            )
                                        )
                                        .filter(Boolean)}
                                    onChange={handleAttendanceChange}
                                    disabled={selectedReport.isLocked}
                                    renderTags={(value, getTagProps) =>
                                        value.map((option, index) => {
                                            // שולפים את ה-key החוצה מהאובייקט
                                            const { key, ...tagProps } =
                                                getTagProps({ index });
                                            return (
                                                <Chip
                                                    key={key} // מעבירים אותו במפורש
                                                    label={option?.username}
                                                    {...tagProps} // ואת השאר שופכים כרגיל
                                                />
                                            );
                                        })
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            variant="outlined"
                                            placeholder="בחר עובדים..."
                                        />
                                    )}
                                />
                            </Box>

                            <Box sx={{ height: "40%" }}>
                                <Typography
                                    variant="h6"
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    יומן מבצעים / משימות שוטפות
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={10}
                                    variant="outlined"
                                    placeholder="הכנס פירוט אירועים ומשימות כאן..."
                                    value={selectedReport.currentTasks}
                                    onChange={(e) =>
                                        setSelectedReport({
                                            ...selectedReport,
                                            currentTasks: e.target.value,
                                        })
                                    }
                                    disabled={selectedReport.isLocked}
                                    sx={{ bgcolor: "background.default" }}
                                />
                            </Box>
                        </Paper>
                    ) : (
                        <Paper
                            sx={{
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexDirection: "column",
                                gap: 2,
                            }}
                        >
                            <Typography variant="h4" color="text.secondary">
                                Select a report to view details
                            </Typography>
                            <Button
                                variant="outlined"
                                startIcon={<AddIcon />}
                                onClick={handleCreateReport}
                            >
                                Create New Shift Report
                            </Button>
                        </Paper>
                    )}
                </Grid>
            </Grid>

            <ConfirmDialog
                open={!!deleteReportId}
                title="Delete Report"
                content="Are you sure you want to delete this shift report?"
                onCancel={() => setDeleteReportId(null)}
                onConfirm={handleDeleteReport}
            />
        </Container>
    );
}
