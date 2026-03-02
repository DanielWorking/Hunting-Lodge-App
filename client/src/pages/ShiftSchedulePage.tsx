import { useState, useEffect, useRef, useCallback } from "react";
import {
    Container,
    Typography,
    Box,
    Button,
    IconButton,
    Menu,
    MenuItem,
    Dialog,
    AppBar,
    Toolbar,
    Slide,
    Tooltip,
} from "@mui/material";
import { type TransitionProps } from "@mui/material/transitions";
import React from "react";
import {
    startOfWeek,
    endOfWeek,
    addDays,
    addWeeks,
    subWeeks,
    format,
    isSameDay,
    parseISO,
} from "date-fns";
import axios from "axios";

import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import SaveIcon from "@mui/icons-material/Save";
import PublishIcon from "@mui/icons-material/Publish";
import CircleIcon from "@mui/icons-material/Circle";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import CloseIcon from "@mui/icons-material/Close";

import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import type { ShiftType } from "../types";
import ThinkingLoader from "../components/ThinkingLoader";
import ScheduleTable from "../components/ScheduleTable";

interface LocalShift {
    userId: string;
    date: Date;
    shiftTypeId: string;
    vacationDeducted?: boolean;
}

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

export default function ShiftSchedulePage() {
    const { user, currentGroup, isShiftManager, isAdmin } = useUser();
    const { users, groups, refreshData } = useData();
    const { showNotification } = useNotification();

    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [scheduleData, setScheduleData] = useState<any>(null);
    const [shifts, setShifts] = useState<LocalShift[]>([]);

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedCell, setSelectedCell] = useState<{
        userId: string;
        date: Date;
    } | null>(null);
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const tableRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }).map((_, i) =>
        addDays(weekStart, i),
    );

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id),
    )?.settings;
    const shiftTypes = groupSettings?.shiftTypes || [];

    const activeUsers = users
        .filter((u) => {
            if (!u.isActive) return false;
            return u.groups.some(
                (g) => g.groupId === (currentGroup?._id || currentGroup?.id),
            );
        })
        .sort((a, b) => {
            const orderA =
                a.groups.find(
                    (g) =>
                        g.groupId === (currentGroup?._id || currentGroup?.id),
                )?.order || 0;
            const orderB =
                b.groups.find(
                    (g) =>
                        g.groupId === (currentGroup?._id || currentGroup?.id),
                )?.order || 0;
            return orderA - orderB;
        });

    useEffect(() => {
        if (currentGroup) {
            fetchSchedule();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentGroup, weekStart.toISOString()]);

    useEffect(() => {
        if (isFullScreen && tableRef.current && containerRef.current) {
            tableRef.current.style.transform = "none";
            const availableHeight = window.innerHeight - 70;
            const contentHeight = tableRef.current.scrollHeight;

            if (contentHeight > availableHeight) {
                const scale = availableHeight / contentHeight;
                tableRef.current.style.transform = `scale(${scale})`;
                tableRef.current.style.transformOrigin = "top center";
                tableRef.current.style.width = `${100 / scale}%`;
            } else {
                tableRef.current.style.width = "100%";
            }
        }
    }, [isFullScreen, activeUsers, shifts]);

    const fetchSchedule = async () => {
        try {
            setLoading(true);
            const groupId = currentGroup?._id || currentGroup?.id;
            const userId = user?._id || user?.id;

            const response = await axios.get("/api/schedules", {
                params: { groupId, date: weekStart.toISOString() },
                headers: { "x-user-id": userId },
            });

            const data = response.data;
            setScheduleData(data);

            if (data && data.shifts) {
                const parsedShifts = data.shifts.map((s: any) => ({
                    userId: s.userId,
                    shiftTypeId: s.shiftTypeId,
                    date: parseISO(s.date),
                    vacationDeducted: s.vacationDeducted,
                }));
                setShifts(parsedShifts);
            } else {
                setShifts([]);
            }
        } catch (error) {
            console.error(error);
            showNotification("Error loading schedule", "error");
        } finally {
            setLoading(false);
        }
    };

    // שימוש ב-useCallback כדי שהפונקציה לא תיווצר מחדש בכל רינדור (חשוב ל-memo של הטבלה)
    const handleCellClick = useCallback(
        (
            event: React.MouseEvent<HTMLTableDataCellElement>,
            userId: string,
            date: Date,
        ) => {
            if (!isShiftManager && !isAdmin) return;
            setAnchorEl(event.currentTarget);
            setSelectedCell({ userId, date });
        },
        [isShiftManager, isAdmin],
    );

    const handleSelectShift = (type: ShiftType | null) => {
        if (!selectedCell) return;

        setShifts((prev) => {
            const clean = prev.filter(
                (s) =>
                    !(
                        s.userId === selectedCell.userId &&
                        isSameDay(s.date, selectedCell.date)
                    ),
            );

            if (type) {
                return [
                    ...clean,
                    {
                        userId: selectedCell.userId,
                        date: selectedCell.date,
                        shiftTypeId: type._id,
                        vacationDeducted: false,
                    },
                ];
            }
            return clean;
        });

        handleCloseMenu();
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedCell(null);
    };

    const performSave = async () => {
        const groupId = currentGroup?._id || currentGroup?.id;
        const res = await axios.put("/api/schedules", {
            groupId,
            startDate: weekStart,
            endDate: endOfWeek(currentDate, { weekStartsOn: 0 }),
            shifts: shifts,
        });
        setScheduleData(res.data);
        return res.data._id;
    };

    const handleSaveClick = async () => {
        try {
            await performSave();
            showNotification("Schedule saved as Draft", "success");
            refreshData();
            fetchSchedule();
        } catch (error) {
            showNotification("Error saving schedule", "error");
        }
    };

    const handlePublishClick = async () => {
        try {
            await performSave();
            setIsPublishDialogOpen(true);
        } catch (error) {
            showNotification("Error saving before publish", "error");
        }
    };

    const handleConfirmPublish = async () => {
        if (!scheduleData?._id) return;

        try {
            await axios.post("/api/schedules/publish", {
                scheduleId: scheduleData._id,
            });
            showNotification("Schedule Published Successfully!", "success");

            refreshData();
            fetchSchedule();
        } catch (error) {
            showNotification("Error publishing", "error");
        } finally {
            setIsPublishDialogOpen(false);
        }
    };

    if (!currentGroup)
        return (
            <Container>
                <Typography>Please select a group.</Typography>
            </Container>
        );

    // הגדרת ה-Props המשותפים לטבלה כדי למנוע שכפול קוד ב-JSX
    const tableProps = {
        weekDays,
        activeUsers,
        shifts,
        shiftTypes,
        isShiftManager: !!isShiftManager,
        isAdmin: !!isAdmin,
        selectedCell,
        onCellClick: handleCellClick,
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={3}
            >
                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton
                        onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
                    >
                        <ArrowBackIosNewIcon />
                    </IconButton>

                    <Box textAlign="center">
                        <Typography variant="h5" fontWeight="bold">
                            {format(weekStart, "dd/MM/yyyy")} -{" "}
                            {format(
                                endOfWeek(currentDate, { weekStartsOn: 0 }),
                                "dd/MM/yyyy",
                            )}
                        </Typography>
                        <Typography variant="subtitle2" color="text.secondary">
                            Status:{" "}
                            {scheduleData?.isPublished ? (
                                <span
                                    style={{
                                        color: "green",
                                        fontWeight: "bold",
                                    }}
                                >
                                    PUBLISHED
                                </span>
                            ) : (
                                <span
                                    style={{
                                        color: "orange",
                                        fontWeight: "bold",
                                    }}
                                >
                                    DRAFT
                                </span>
                            )}
                        </Typography>
                    </Box>

                    <IconButton
                        onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
                    >
                        <ArrowForwardIosIcon />
                    </IconButton>

                    <Tooltip title="Full Screen Mode">
                        <IconButton
                            onClick={() => setIsFullScreen(true)}
                            color="primary"
                        >
                            <FullscreenIcon fontSize="large" />
                        </IconButton>
                    </Tooltip>
                </Box>

                {(isShiftManager || isAdmin) && (
                    <Box gap={2} display="flex">
                        <Button
                            variant="outlined"
                            startIcon={<SaveIcon />}
                            onClick={handleSaveClick}
                        >
                            Save Draft
                        </Button>
                        <Button
                            variant="contained"
                            color={
                                scheduleData?.isPublished
                                    ? "success"
                                    : "primary"
                            }
                            startIcon={<PublishIcon />}
                            onClick={handlePublishClick}
                        >
                            {scheduleData?.isPublished
                                ? "Update & Publish"
                                : "Publish"}
                        </Button>
                    </Box>
                )}
            </Box>

            {loading ? (
                <ThinkingLoader />
            ) : (
                <ScheduleTable isFull={false} {...tableProps} />
            )}

            <Dialog
                fullScreen
                open={isFullScreen}
                onClose={() => setIsFullScreen(false)}
                TransitionComponent={Transition}
                PaperProps={{
                    sx: { bgcolor: "background.default", overflow: "hidden" },
                }}
            >
                <AppBar
                    sx={{
                        position: "relative",
                        bgcolor: "background.paper",
                        color: "text.primary",
                        boxShadow: 1,
                    }}
                >
                    <Toolbar variant="dense">
                        <IconButton
                            edge="start"
                            color="inherit"
                            onClick={() => setIsFullScreen(false)}
                            aria-label="close"
                        >
                            <CloseIcon />
                        </IconButton>
                        <Typography
                            sx={{ ml: 2, flex: 1 }}
                            variant="h6"
                            component="div"
                        >
                            Full View
                        </Typography>
                    </Toolbar>
                </AppBar>

                <Box
                    ref={containerRef}
                    sx={{
                        flex: 1,
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "center",
                        height: "calc(100vh - 50px)",
                        width: "100%",
                        overflow: "hidden",
                        pt: 2,
                    }}
                >
                    {/* השימוש ברכיב הנפרד למצב מסך מלא + העברת ה-Ref */}
                    <ScheduleTable
                        isFull={true}
                        ref={tableRef}
                        {...tableProps}
                    />
                </Box>
            </Dialog>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
            >
                <MenuItem
                    onClick={() => handleSelectShift(null)}
                    sx={{ color: "error.main" }}
                >
                    <em>Clear Shift</em>
                </MenuItem>
                {shiftTypes.map((type) => (
                    <MenuItem
                        key={type._id}
                        onClick={() => handleSelectShift(type)}
                    >
                        <CircleIcon
                            sx={{ color: type.color, mr: 1, fontSize: 16 }}
                        />
                        {type.name}
                    </MenuItem>
                ))}
            </Menu>

            <ConfirmDialog
                open={isPublishDialogOpen}
                title="Publish Schedule?"
                content="Publishing will make the schedule visible to all users. Vacation days will be calculated based on assigned shifts. Continue?"
                onCancel={() => setIsPublishDialogOpen(false)}
                onConfirm={handleConfirmPublish}
                confirmText="Publish"
                confirmColor="success"
            />
        </Container>
    );
}
