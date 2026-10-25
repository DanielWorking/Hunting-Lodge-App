/**
 * @module ShiftSchedulePage
 *
 * Provides the user interface for viewing and managing shift schedules.
 * Includes features for weekly navigation, draft saving, and full-screen visualization.
 *
 * Loading: one request per (group, week); a response that is no longer the latest is ignored, and a
 * failed load shows an inline Retry instead of retrying on its own. Saving: the grid's state is
 * rebuilt from the PUT/POST responses, Save Draft and Publish are disabled while loading, while
 * saving, after a failed load and when there is nothing to save or publish, and only the shifts of
 * the members shown in the grid (active members of the group) are sent.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
    Alert,
} from "@mui/material";
import { type TransitionProps } from "@mui/material/transitions";
import React from "react";
import axios from "axios";
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
import { getSchedule, saveSchedule, publishSchedule } from "../api/schedulesApi";
import { isRateLimitError, rateLimitMessage } from "../api/apiClient";

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
import type { ShiftType, ShiftAssignment, ShiftSchedule, VacationValue } from "../types";
import ThinkingLoader from "../components/ThinkingLoader";
import ScheduleTable from "../components/ScheduleTable";

interface LocalShift {
    userId: string;
    date: Date;
    shiftTypeId: string;
    vacationDeducted?: boolean;
    vacationValue?: VacationValue;
}

const Transition = React.forwardRef(function Transition(
    props: TransitionProps & { children: React.ReactElement },
    ref: React.Ref<unknown>,
) {
    return <Slide direction="up" ref={ref} {...props} />;
});

const toLocalShift = (s: ShiftAssignment): LocalShift => ({
    userId: String(s.userId),
    shiftTypeId: String(s.shiftTypeId),
    date: typeof s.date === "string" ? parseISO(s.date) : s.date instanceof Date ? s.date : new Date(s.date || NaN),
    vacationDeducted: s.vacationDeducted,
    vacationValue: s.vacationValue,
});

/**
 * A comparable fingerprint of the given members' shifts: sorted `userId|date|shiftTypeId|value`
 * keys. A missing vacation value counts as 1, as the server stores it, so a shift that only went
 * through a save still compares equal.
 */
const shiftsFingerprint = (shifts: readonly LocalShift[], userIds: ReadonlySet<string>): string =>
    shifts
        .filter((s) => userIds.has(s.userId))
        .map((s) => `${s.userId}|${s.date.getTime()}|${s.shiftTypeId}|${s.vacationValue ?? 1}`)
        .sort()
        .join(";");

const isCanceled = (error: unknown): boolean =>
    axios.isCancel(error) ||
    (typeof error === "object" &&
        error !== null &&
        ((error as { name?: string }).name === "CanceledError" ||
            (error as { name?: string }).name === "AbortError"));

/** State that belongs to one group and week, identified by `${groupId}|${weekStartMs}`. */
interface ForWeek<T> {
    readonly key: string;
    readonly value: T;
}

export default function ShiftSchedulePage() {
    const { currentGroup, isShiftManager } = useUser();
    const { users, groups, refreshData } = useData();
    const { showNotification } = useNotification();

    const [currentDate, setCurrentDate] = useState(new Date());
    // The schedule the server last returned (null: none exists yet), its load failure, and the
    // manager's unsaved edits. Each is tagged with its group and week, so the page can never show,
    // compare against or save into another week's data.
    const [loaded, setLoaded] = useState<ForWeek<ShiftSchedule | null> | null>(null);
    const [failed, setFailed] = useState<ForWeek<string> | null>(null);
    const [edited, setEdited] = useState<ForWeek<LocalShift[]> | null>(null);
    const [reloadToken, setReloadToken] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedCell, setSelectedCell] = useState<{
        userId: string;
        date: Date;
    } | null>(null);
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    const tableRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // Only the latest load may update the page; earlier responses are ignored
    const latestLoadRef = useRef(0);
    // Guards double submits before the isSaving state has re-rendered the buttons
    const savingRef = useRef(false);

    const weekStart = useMemo(
        () => startOfWeek(currentDate, { weekStartsOn: 0 }),
        [currentDate],
    );
    const weekStartMs = weekStart.getTime();
    const weekDays = useMemo(
        () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
        [weekStart],
    );
    const groupId = currentGroup?._id;
    const weekKey = groupId ? `${groupId}|${weekStartMs}` : null;

    const isLoaded = loaded !== null && loaded.key === weekKey;
    const scheduleData = isLoaded ? loaded.value : null;
    const loadError = failed !== null && failed.key === weekKey ? failed.value : null;
    const loading = weekKey !== null && !isLoaded && loadError === null;
    // The shifts as last loaded, saved or published: the baseline for "has anything changed?"
    const savedShifts = useMemo(() => (scheduleData?.shifts ?? []).map(toLocalShift), [scheduleData]);
    const shifts = edited !== null && edited.key === weekKey ? edited.value : savedShifts;

    const shiftTypes = useMemo(() => {
        const groupSettings = groups.find(
            (g) => g._id === currentGroup?._id,
        )?.settings;
        return groupSettings?.shiftTypes || [];
    }, [groups, currentGroup?._id]);

    const activeUsers = useMemo(() => {
        return users
            .filter((u) => {
                if (!u.isActive) return false;
                return u.groups.some(
                    (g) => g.groupId === currentGroup?._id,
                );
            })
            .sort((a, b) => {
                const orderA =
                    a.groups.find(
                        (g) =>
                            g.groupId === currentGroup?._id,
                    )?.order || 0;
                const orderB =
                    b.groups.find(
                        (g) =>
                            g.groupId === currentGroup?._id,
                    )?.order || 0;
                return orderA - orderB;
            });
    }, [users, currentGroup?._id]);

    // Only members shown in the grid appear in the schedule: the rest is neither compared nor sent
    const shownUserIds = useMemo(() => new Set(activeUsers.map((u) => u._id)), [activeUsers]);
    const isDirty = useMemo(
        () => shiftsFingerprint(shifts, shownUserIds) !== shiftsFingerprint(savedShifts, shownUserIds),
        [shifts, savedShifts, shownUserIds],
    );

    /** Shows a schedule the server returned for `key` as the page's state and change baseline. */
    const showSchedule = (key: string, data: ShiftSchedule | null) => {
        setLoaded({ key, value: data });
        setEdited(null);
    };

    // Loads the week. Keyed on the group id and the week only: a new group object (after a refresh)
    // or a toast must not reload it. A failure is shown inline with Retry; nothing retries on its own.
    useEffect(() => {
        if (!groupId) return;
        const key = `${groupId}|${weekStartMs}`;
        const loadId = ++latestLoadRef.current;
        const controller = new AbortController();
        const isLatest = () => loadId === latestLoadRef.current;

        getSchedule({ groupId, date: new Date(weekStartMs).toISOString() }, { signal: controller.signal })
            .then((response) => {
                if (isLatest()) setLoaded({ key, value: response.data });
            })
            .catch((error: unknown) => {
                if (!isLatest() || isCanceled(error)) return;
                // 404 means no schedule exists for this week yet: an empty grid, not an error
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    setLoaded({ key, value: null });
                    return;
                }
                console.error(error);
                setFailed({
                    key,
                    value: isRateLimitError(error)
                        ? rateLimitMessage(error)
                        : "The schedule for this week could not be loaded.",
                });
            });

        return () => {
            controller.abort();
        };
    }, [groupId, weekStartMs, reloadToken]);

    /** Moves to another week, dropping this week's schedule and unsaved edits first. */
    const changeWeek = (date: Date) => {
        setLoaded(null);
        setEdited(null);
        setFailed(null);
        setCurrentDate(date);
    };

    const retryLoad = () => {
        setFailed(null);
        setReloadToken((token) => token + 1);
    };

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

    /**
     * Handles clicking on a table cell to select a shift.
     *
     * Only allows interaction if the user is a shift manager of this group.
     *
     * @param {React.MouseEvent<HTMLTableDataCellElement>} event  The mouse event.
     * @param {string}                                     userId The ID of the user for the selected cell.
     * @param {Date}                                       date   The date for the selected cell.
     */
    const handleCellClick = useCallback(
        (
            event: React.MouseEvent<HTMLTableDataCellElement>,
            userId: string,
            date: Date,
        ) => {
            if (!isShiftManager) return;
            setAnchorEl(event.currentTarget);
            setSelectedCell({ userId, date });
        },
        [isShiftManager],
    );

    /**
     * Updates the local shifts state with the selected shift type for a specific cell.
     *
     * @param {ShiftType | null} type The shift type to assign, or null to clear.
     * @param {0.5 | 1.0} [vacationValue=1.0] Duration in days for vacation shifts.
     */
    const handleSelectShift = (type: ShiftType | null, vacationValue: 0.5 | 1.0 = 1.0) => {
        if (!selectedCell || !weekKey) return;

        const clean = shifts.filter(
            (s) =>
                !(
                    s.userId === selectedCell.userId &&
                    isSameDay(s.date, selectedCell.date)
                ),
        );
        const next: LocalShift[] = type
            ? [
                ...clean,
                {
                    userId: selectedCell.userId,
                    date: selectedCell.date,
                    shiftTypeId: type._id,
                    vacationDeducted: false,
                    vacationValue: type.isVacation ? vacationValue : undefined,
                },
            ]
            : clean;
        setEdited({ key: weekKey, value: next });

        handleCloseMenu();
    };

    /**
     * Closes the shift selection menu.
     */
    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedCell(null);
    };

    const hasSchedule = Boolean(scheduleData?._id);
    const isPublished = Boolean(scheduleData?.isPublished);
    const hasPendingDraft = Boolean(scheduleData?.hasUnpublishedChanges);
    const actionsBlocked = loading || isSaving || loadError !== null;
    const canSave = isDirty;
    // Publishing is a change when the grid changed, or when a saved draft (or an unpublished week) waits
    const canPublish = isDirty || (hasSchedule && (!isPublished || hasPendingDraft));

    /** Reports a failed save or publish once: the rate-limit delay, the server's reason, or a fallback. */
    const reportFailure = (error: unknown, fallback: string) => {
        if (isRateLimitError(error)) {
            showNotification(rateLimitMessage(error), "error");
            return;
        }
        const serverMessage = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
        showNotification(typeof serverMessage === "string" ? serverMessage : fallback, "error");
    };

    /**
     * Saves the grid as a draft and shows the server's response as the new state.
     * Sends only the shifts of the members shown in the grid; the server keeps everyone else's.
     */
    const performSave = async () => {
        // Save under the loaded schedule's own range only if it covers the week on screen: GET can
        // match a schedule whose start differs from this page's week start (e.g. one saved from
        // another time zone), and re-keying it would charge its vacation again on publish
        const savedStart = scheduleData?.startDate ? new Date(scheduleData.startDate).getTime() : NaN;
        const savedEnd = scheduleData?.endDate ? new Date(scheduleData.endDate).getTime() : NaN;
        const coversWeek = savedStart <= weekStartMs && (Number.isNaN(savedEnd) || savedEnd >= weekStartMs);
        const key = weekKey;
        const res = await saveSchedule({
            groupId,
            startDate: coversWeek ? scheduleData?.startDate : weekStart,
            endDate: coversWeek && scheduleData?.endDate ? scheduleData.endDate : endOfWeek(currentDate, { weekStartsOn: 0 }),
            shifts: shifts.filter((s) => shownUserIds.has(s.userId)),
        });
        if (key) showSchedule(key, res.data);
        return res.data as ShiftSchedule;
    };

    /** Runs one save or publish at a time; a second click while one runs is ignored. */
    const runExclusive = async (action: () => Promise<void>) => {
        if (savingRef.current) return;
        savingRef.current = true;
        setIsSaving(true);
        try {
            await action();
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    /**
     * Handles the save button click event.
     *
     * @returns {Promise<void>}
     */
    const handleSaveClick = () =>
        runExclusive(async () => {
            if (actionsBlocked || !canSave) return;
            try {
                await performSave();
                showNotification("Schedule saved as Draft", "success");
            } catch (error: unknown) {
                reportFailure(error, "Error saving schedule");
            }
        });

    /**
     * Handles the publish button click event.
     *
     * Saves the grid first only when it changed (an unchanged saved draft is published as it is),
     * then opens the publish confirmation dialog.
     *
     * @returns {Promise<void>}
     */
    const handlePublishClick = () =>
        runExclusive(async () => {
            if (actionsBlocked || !canPublish) return;
            try {
                if (isDirty) {
                    await performSave();
                }
                setIsPublishDialogOpen(true);
            } catch (error: unknown) {
                reportFailure(error, "Error saving before publish");
            }
        });

    /**
     * Confirms and publishes the schedule on the server, then shows the published schedule.
     *
     * @returns {Promise<void>}
     */
    const handleConfirmPublish = () =>
        runExclusive(async () => {
            if (!scheduleData?._id || !weekKey) return;
            const key = weekKey;
            try {
                // Publish exactly the version the manager just saved and confirmed
                const response = await publishSchedule(scheduleData._id, scheduleData.revision);
                showSchedule(key, response.data);
                if (response.data?.unchanged) {
                    showNotification("Nothing to publish: members already see this schedule.", "info");
                } else {
                    showNotification("Schedule Published Successfully!", "success");
                    // Vacation balances changed with the publish
                    refreshData();
                }
            } catch (error: unknown) {
                // The server explains refusals such as insufficient vacation balance; show that text
                reportFailure(error, "Error publishing");
            } finally {
                setIsPublishDialogOpen(false);
            }
        });

    if (!currentGroup)
        return (
            <Container>
                <Typography>Please select a group.</Typography>
            </Container>
        );

    // Shared table props to avoid duplication in JSX
    const tableProps = {
        weekDays,
        activeUsers,
        shifts,
        shiftTypes,
        isShiftManager: !!isShiftManager,
        selectedCell,
        onCellClick: handleCellClick,
    };

    const nothingToPublish = !canPublish && !actionsBlocked;

    return (
        <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
            <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={3}
            >
                <Box display="flex" alignItems="center" gap={2}>
                    <IconButton
                        onClick={() => changeWeek(subWeeks(currentDate, 1))}
                        aria-label="Previous week"
                        disabled={isSaving}
                    >
                        <ArrowBackIosNewIcon />
                    </IconButton>

                    <Box textAlign="center">
                        <Typography variant="h5" component="h1" fontWeight="bold">
                            {format(weekStart, "dd/MM/yyyy")} -{" "}
                            {format(
                                endOfWeek(currentDate, { weekStartsOn: 0 }),
                                "dd/MM/yyyy",
                            )}
                        </Typography>
                        <Typography variant="subtitle2" component="p" color="text.secondary">
                            Status:{" "}
                            {loading || loadError ? (
                                <Box component="span">—</Box>
                            ) : scheduleData?.isPublished ? (
                                <Box
                                    component="span"
                                    sx={{
                                        color: "#15803D",
                                        fontWeight: "bold",
                                    }}
                                >
                                    PUBLISHED
                                    {/* Saved edits stay invisible to members until the next publish succeeds */}
                                    {scheduleData?.hasUnpublishedChanges && (
                                        <Box component="span" sx={{ color: "#B45309", ml: 1 }}>
                                            (unpublished changes)
                                        </Box>
                                    )}
                                </Box>
                            ) : (
                                <Box
                                    component="span"
                                    sx={{
                                        color: "#B45309",
                                        fontWeight: "bold",
                                    }}
                                >
                                    DRAFT
                                </Box>
                            )}
                        </Typography>
                    </Box>

                    <IconButton
                        onClick={() => changeWeek(addWeeks(currentDate, 1))}
                        aria-label="Next week"
                        disabled={isSaving}
                    >
                        <ArrowForwardIosIcon />
                    </IconButton>

                    <Tooltip title="Full Screen Mode">
                        <IconButton
                            onClick={() => setIsFullScreen(true)}
                            color="primary"
                            aria-label="Toggle full screen schedule"
                        >
                            <FullscreenIcon fontSize="large" />
                        </IconButton>
                    </Tooltip>
                </Box>

                {isShiftManager && (
                    <Box gap={2} display="flex">
                        {/* A disabled button fires no events: the span carries the tooltip */}
                        <Tooltip title={!canSave && !actionsBlocked ? "No changes to save" : ""}>
                            <span>
                                <Button
                                    variant="outlined"
                                    startIcon={<SaveIcon />}
                                    onClick={handleSaveClick}
                                    disabled={actionsBlocked || !canSave}
                                >
                                    Save Draft
                                </Button>
                            </span>
                        </Tooltip>
                        <Tooltip title={nothingToPublish ? "No changes to publish" : ""}>
                            <span>
                                <Button
                                    variant="contained"
                                    color={
                                        scheduleData?.isPublished
                                            ? "success"
                                            : "primary"
                                    }
                                    startIcon={<PublishIcon />}
                                    onClick={handlePublishClick}
                                    disabled={actionsBlocked || !canPublish}
                                >
                                    {scheduleData?.isPublished
                                        ? "Update & Publish"
                                        : "Publish"}
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>
                )}
            </Box>

            {loading ? (
                <ThinkingLoader />
            ) : loadError ? (
                <Alert
                    severity="error"
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={retryLoad}
                        >
                            Retry
                        </Button>
                    }
                >
                    Couldn't load this week. {loadError}
                </Alert>
            ) : (
                <ScheduleTable isFull={false} {...tableProps} />
            )}

            {/* --- FULL SCREEN DIALOG --- */}
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
                            aria-label="Close full view"
                        >
                            <CloseIcon />
                        </IconButton>
                        <Typography
                            sx={{ ml: 2, flex: 1 }}
                            variant="h6"
                            component="h2"
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
                    {/* Render the separate table component for full-screen mode and pass the Ref for scaling. */}
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
                {shiftTypes.map((type) => {
                    if (type.isVacation) {
                        return (
                            <React.Fragment key={type._id}>
                                <MenuItem
                                    onClick={() => handleSelectShift(type, 1.0)}
                                >
                                    <CircleIcon
                                        sx={{ color: type.color, mr: 1, fontSize: 16 }}
                                    />
                                    {type.name} (1.0)
                                </MenuItem>
                                <MenuItem
                                    onClick={() => handleSelectShift(type, 0.5)}
                                >
                                    <CircleIcon
                                        sx={{ color: type.color, mr: 1, fontSize: 16, opacity: 0.7 }}
                                    />
                                    {type.name} (0.5)
                                </MenuItem>
                            </React.Fragment>
                        );
                    }
                    return (
                        <MenuItem
                            key={type._id}
                            onClick={() => handleSelectShift(type)}
                        >
                            <CircleIcon
                                sx={{ color: type.color, mr: 1, fontSize: 16 }}
                            />
                            {type.name}
                        </MenuItem>
                    );
                })}
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
