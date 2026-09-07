/**
 * @module ShiftReportPage
 *
 * Provides a comprehensive interface for creating, viewing, and editing
 * shift reports. Includes a rich-text editor (Tiptap) for detailed task
 * logs, automatic shift detection based on group settings, and an
 * archive sidebar organized by date.
 */

import { useState, useEffect, useRef, useCallback, type SyntheticEvent } from "react";
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
import MenuIcon from "@mui/icons-material/Menu";

import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import ConfirmDialog from "../components/ConfirmDialog";
import { getReports, createReport, updateReport, deleteReport } from "../api/reportsApi";
import { format } from "date-fns";
import ThinkingLoader from "../components/ThinkingLoader";
import type { ShiftReport, ShiftReportAttendee, User } from "../types";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Tooltip from "@mui/material/Tooltip";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import StrikethroughSIcon from "@mui/icons-material/StrikethroughS";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatColorTextIcon from "@mui/icons-material/FormatColorText";
import HighlightIcon from "@mui/icons-material/Highlight";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";

/**
 * A customized Tiptap rich-text editor component.
 *
 * Provides a specialized editor interface for shift reports, supporting
 * RTL text alignment, various formatting options (bold, italic, underline, strike),
 * lists, text colors, and highlights.
 *
 * @param {Object}   props              Component properties.
 * @param {string}   props.value        The current HTML content of the editor.
 * @param {function} props.onChange     Callback function to handle content updates.
 * @param {string}   props.placeholder  The text to display when the editor is empty.
 * @param {boolean}  props.readOnly     If true, the editor is in read-only mode.
 * @returns {JSX.Element | null} The rendered editor or null if not initialized.
 */
export const TiptapEditor = ({
    value,
    onChange,
    placeholder,
    readOnly,
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    readOnly: boolean;
}) => {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            TextAlign.configure({
                types: ["heading", "paragraph"],
                defaultAlignment: "right", // Native support for RTL alignment
            }),
            TextStyleKit,
            Color,
            Highlight.configure({ multicolor: true }), // Support for multi-colored highlighting
            TiptapLink.configure({
                openOnClick: false,
                HTMLAttributes: {
                    target: "_blank",
                    rel: "noopener noreferrer",
                },
            }),
            Placeholder.configure({
                placeholder: placeholder,
            }),
        ],
        content: value,
        editable: !readOnly,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) return;
        const currentHTML = editor.getHTML();
        const isSame =
            (value || "") === currentHTML ||
            (!value && (editor.isEmpty || currentHTML === "<p></p>"));
        if (!isSame && !editor.isFocused) {
            editor.commands.setContent(value || "", { emitUpdate: false });
        }
    }, [value, editor]);

    useEffect(() => {
        if (!editor) return;
        if (editor.isEditable === readOnly) {
            editor.setEditable(!readOnly, false);
        }
    }, [readOnly, editor]);

    if (!editor) {
        return null;
    }

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Toolbar with formatting icons */}
            {!readOnly && (
                <Box
                    sx={{
                        display: "flex",
                        gap: 0.5,
                        p: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        flexWrap: "wrap",
                        direction: "ltr",
                        alignItems: "center",
                    }}
                >
                    {/* Basic text formatting */}
                    <Tooltip title="Bold">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("bold") ? "primary" : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleBold().run()
                            }
                        >
                            <FormatBoldIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Italic">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("italic")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleItalic().run()
                            }
                        >
                            <FormatItalicIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Underline">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("underline")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleUnderline().run()
                            }
                        >
                            <FormatUnderlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Strike">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("strike")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleStrike().run()
                            }
                        >
                            <StrikethroughSIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                    {/* Text alignment controls */}
                    <Tooltip title="Align Right (RTL)">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive({ textAlign: "right" })
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .setTextAlign("right")
                                    .run()
                            }
                        >
                            <FormatAlignRightIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    {/* Added center alignment button */}
                    <Tooltip title="Align Center">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive({ textAlign: "center" })
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .setTextAlign("center")
                                    .run()
                            }
                        >
                            <FormatAlignCenterIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Align Left (LTR)">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive({ textAlign: "left" })
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor
                                    .chain()
                                    .focus()
                                    .setTextAlign("left")
                                    .run()
                            }
                        >
                            <FormatAlignLeftIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                    {/* List controls */}
                    <Tooltip title="Bullet List">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("bulletList")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleBulletList().run()
                            }
                        >
                            <FormatListBulletedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Ordered List">
                        <IconButton
                            size="small"
                            color={
                                editor.isActive("orderedList")
                                    ? "primary"
                                    : "default"
                            }
                            onClick={() =>
                                editor.chain().focus().toggleOrderedList().run()
                            }
                        >
                            <FormatListNumberedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

                    {/* Colors and highlights */}
                    <Tooltip title="Text Color">
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                position: "relative",
                                cursor: "pointer",
                                width: 26,
                                height: 26,
                                ml: 1,
                                mr: 1,
                            }}
                        >
                            <FormatColorTextIcon
                                fontSize="small"
                                sx={{
                                    color:
                                        editor.getAttributes("textStyle")
                                            .color || "inherit",
                                    position: "absolute",
                                    pointerEvents: "none",
                                }}
                            />
                            <input
                                type="color"
                                aria-label="Text Color"
                                onInput={(event) =>
                                    editor
                                        .chain()
                                        .focus()
                                        .setColor(
                                            (event.target as HTMLInputElement)
                                                .value,
                                        )
                                        .run()
                                }
                                value={
                                    editor.getAttributes("textStyle").color ||
                                    "#000000"
                                }
                                style={{
                                    opacity: 0,
                                    width: "100%",
                                    height: "100%",
                                    cursor: "pointer",
                                }}
                            />
                        </Box>
                    </Tooltip>

                    {/* Using a color picker for highlighters to match standard word processors */}
                    <Tooltip title="Highlight Color">
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                position: "relative",
                                cursor: "pointer",
                                width: 26,
                                height: 26,
                                ml: 1,
                                mr: 1,
                            }}
                        >
                            <HighlightIcon
                                fontSize="small"
                                sx={{
                                    color:
                                        editor.getAttributes("highlight")
                                            .color || "inherit",
                                    position: "absolute",
                                    pointerEvents: "none",
                                }}
                            />
                            <input
                                type="color"
                                aria-label="Highlight Color"
                                onInput={(event) =>
                                    editor
                                        .chain()
                                        .focus()
                                        .setHighlight({
                                            color: (
                                                event.target as HTMLInputElement
                                            ).value,
                                        })
                                        .run()
                                }
                                value={
                                    editor.getAttributes("highlight").color ||
                                    "#ffff00"
                                }
                                style={{
                                    opacity: 0,
                                    width: "100%",
                                    height: "100%",
                                    cursor: "pointer",
                                }}
                            />
                        </Box>
                    </Tooltip>
                </Box>
            )}

            {/* Main editing area */}
            <Box
                sx={{
                    flexGrow: 1,
                    overflowY: "auto",
                    p: 2,
                    "& .tiptap": {
                        outline: "none",
                        minHeight: "100px",
                        direction: "rtl",
                        textAlign: "right",
                    },
                    "& .tiptap p.is-editor-empty:first-child::before": {
                        color: "text.disabled",
                        content: "attr(data-placeholder)",
                        float: "right",
                        height: 0,
                        pointerEvents: "none",
                    },
                }}
            >
                <EditorContent editor={editor} style={{ height: "100%" }} />
            </Box>
        </Box>
    );
};

/**
 * The shift report management page.
 *
 * Handles the display of the report archive and the editing of selected
 * reports. Implements background polling for new reports and smart
 * detection of current shifts based on time.
 *
 * @returns {JSX.Element} The rendered ShiftReportPage component.
 */
export default function ShiftReportPage() {
    const { currentGroup, isShiftManager } = useUser();
    const { showNotification } = useNotification();
    const { users, groups } = useData();

    const [reports, setReports] = useState<ShiftReport[]>([]);
    const [selectedReport, setSelectedReport] = useState<ShiftReport | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [pendingSwitchReport, setPendingSwitchReport] = useState<ShiftReport | null>(null);

    const isDirtyRef = useRef(false);
    const selectedReportRef = useRef<ShiftReport | null>(null);

    // Keep synchronization refs up-to-date with current state
    useEffect(() => {
        isDirtyRef.current = isDirty;
    }, [isDirty]);

    useEffect(() => {
        selectedReportRef.current = selectedReport;
    }, [selectedReport]);

    // Tree navigation state for the archive sidebar
    const [openYears, setOpenYears] = useState<{ [key: string]: boolean }>({});
    const [openMonths, setOpenMonths] = useState<{ [key: string]: boolean }>(
        {},
    );
    const [openDays, setOpenDays] = useState<{ [key: string]: boolean }>({});
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);

    const [deleteReportId, setDeleteReportId] = useState<string | null>(null);

    const groupUsers = users.filter((u) =>
        u.groups.some(
            (g) => g.groupId === currentGroup?._id,
        ),
    );

    const groupId = currentGroup?._id;

    /**
     * Fetches reports from the server.
     *
     * Shields active edits: if the user has unsaved modifications (isDirty),
     * background polling updates the archive list without overwriting the active report draft.
     *
     * @param {boolean} [isBackground=false] If true, suppresses the UI loading indicator.
     */
    const fetchReports = useCallback(
        async (isBackground = false) => {
            if (!groupId) return;
            try {
                if (!isBackground) setLoading(true);

                const res = await getReports({ groupId });
                const incomingReports: ShiftReport[] = Array.isArray(res.data)
                    ? res.data
                    : [];

                // Check if a new report was added (for notification purposes)
                setReports((prevReports) => {
                    if (
                        incomingReports.length > prevReports.length &&
                        prevReports.length > 0
                    ) {
                        showNotification("New shift report received", "info");
                    }
                    return incomingReports;
                });

                // Auto-select the most recent report ONLY if none is currently active
                if (!selectedReportRef.current && incomingReports.length > 0) {
                    setSelectedReport(incomingReports[0]);
                    selectedReportRef.current = incomingReports[0];
                    setIsDirty(false);
                    isDirtyRef.current = false;
                } else if (selectedReportRef.current && !isDirtyRef.current) {
                    // If a report is selected and NOT dirty, synchronize with latest server data
                    const updated = incomingReports.find(
                        (r) => r._id === selectedReportRef.current?._id,
                    );
                    if (updated) {
                        setSelectedReport(updated);
                        selectedReportRef.current = updated;
                    }
                }
                // When isDirtyRef.current is true, incoming polling results are shielded:
                // selectedReport remains untouched so user edits are not reverted.
            } catch (error) {
                console.error(error);
            } finally {
                if (!isBackground) setLoading(false);
            }
        },
        [groupId, showNotification],
    );

    useEffect(() => {
        if (!groupId) return;
        let isMounted = true;

        const loadReports = async () => {
            await fetchReports(false);
        };
        void loadReports();

        // Set up background polling every 30 seconds
        const intervalId = setInterval(() => {
            if (isMounted) {
                void fetchReports(true); // true = silent background load
            }
        }, 30000);

        // Cleanup timer on unmount or group change
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [groupId, fetchReports]);

    /**
     * Identifies the current shift slot based on the system time.
     *
     * @returns {Object | undefined} The matching time slot from group settings.
     */
    const findCurrentTimeSlot = () => {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMinute;

        const groupSettings = groups.find(
            (g) => g._id === currentGroup?._id,
        )?.settings;
        const timeSlots = groupSettings?.timeSlots || [];

        return timeSlots.find((slot) => {
            if (!slot.startTime || !slot.endTime) return false;
            const [startH, startM] = slot.startTime.split(":").map(Number);
            const [endH, endM] = slot.endTime.split(":").map(Number);

            const startVal = startH * 60 + startM;
            const endVal = endH * 60 + endM;

            // Handle night shifts crossing midnight (e.g., 23:00 to 07:00)
            if (endVal < startVal) {
                return currentTimeVal >= startVal || currentTimeVal <= endVal;
            }
            // Standard same-day shift
            return currentTimeVal >= startVal && currentTimeVal <= endVal;
        });
    };

    /**
     * Creates a new shift report with automatic title and time range calculation.
     */
    const handleCreateReport = async () => {
        if (!currentGroup) return;

        const now = new Date();
        const currentSlot = findCurrentTimeSlot();

        let title = `Shift Report - ${format(now, "dd/MM/yyyy HH:mm")}`;
        let startTime = now;
        let endTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // Default fallback: +8 hours

        // Smart time calculation if a defined shift slot matches current time
        if (currentSlot) {
            title = `${currentSlot.name} - ${format(now, "dd/MM/yyyy")}`;

            const [startH, startM] = currentSlot.startTime
                .split(":")
                .map(Number);
            const [endH, endM] = currentSlot.endTime.split(":").map(Number);

            const calculatedStart = new Date(now);
            calculatedStart.setHours(startH, startM, 0, 0);

            const calculatedEnd = new Date(now);
            calculatedEnd.setHours(endH, endM, 0, 0);

            // Shift end-time is tomorrow if it crosses midnight
            if (endH < startH || (endH === startH && endM < startM)) {
                calculatedEnd.setDate(calculatedEnd.getDate() + 1);
            }

            startTime = calculatedStart;
            endTime = calculatedEnd;
        }

        try {
            const res = await createReport({
                groupId: currentGroup._id,
                title,
                startTime,
                endTime,
            });

            const newReport = res.data;
            setReports([newReport, ...reports]);
            setSelectedReport(newReport);
            selectedReportRef.current = newReport;
            setIsDirty(false);
            isDirtyRef.current = false;

            const workersCount = newReport.attendees?.length || 0;
            showNotification(
                `New Report Created! (${workersCount} workers added)`,
                "success",
            );
        } catch {
            showNotification("Error creating report", "error");
        }
    };

    /**
     * Persists report changes to the server.
     */
    const handleSaveReport = async () => {
        if (!selectedReport) return;
        try {
            await updateReport(selectedReport._id, {
                currentTasks: selectedReport.currentTasks,
                previousTasks: selectedReport.previousTasks,
                attendees: selectedReport.attendees,
            });
            showNotification("Report saved successfully", "success");
            setIsDirty(false);
            isDirtyRef.current = false;
            setReports((prev) =>
                prev.map((r) =>
                    r._id === selectedReport._id ? selectedReport : r,
                ),
            );
        } catch {
            showNotification("Error saving report", "error");
        }
    };

    /**
     * Reverts unsaved modifications to the currently selected report.
     */
    const handleDiscardChanges = () => {
        if (!selectedReport) return;
        (document.activeElement as HTMLElement)?.blur?.();
        const original = reports.find((r) => r._id === selectedReport._id);
        if (original) {
            setSelectedReport({ ...original });
            selectedReportRef.current = original;
            setIsDirty(false);
            isDirtyRef.current = false;
            showNotification("Changes discarded", "info");
        }
    };

    /**
     * Deletes the selected shift report after confirmation.
     */
    const handleDeleteReport = async () => {
        if (!deleteReportId || !isShiftManager) return;
        try {
            await deleteReport(deleteReportId);
            setReports((prev) => prev.filter((r) => r._id !== deleteReportId));
            if (selectedReport?._id === deleteReportId) {
                setSelectedReport(null);
                selectedReportRef.current = null;
                setIsDirty(false);
                isDirtyRef.current = false;
            }
            showNotification("Report deleted", "success");
        } catch {
            showNotification("Error deleting", "error");
        } finally {
            setDeleteReportId(null);
        }
    };

    /**
     * Handles selecting a report from the archive sidebar, shielding unsaved changes.
     *
     * @param {ShiftReport} rep The report to select.
     */
    const handleSelectReport = (rep: ShiftReport) => {
        if (selectedReport?._id === rep._id) {
            setMobileSidebarOpen(false);
            return;
        }

        if (isDirty) {
            setPendingSwitchReport(rep);
        } else {
            setSelectedReport(rep);
            selectedReportRef.current = rep;
            setMobileSidebarOpen(false);
        }
    };

    const confirmSwitchReport = () => {
        if (pendingSwitchReport) {
            setSelectedReport(pendingSwitchReport);
            selectedReportRef.current = pendingSwitchReport;
            setIsDirty(false);
            isDirtyRef.current = false;
            setPendingSwitchReport(null);
            setMobileSidebarOpen(false);
        }
    };

    const cancelSwitchReport = () => {
        setPendingSwitchReport(null);
    };

    /**
     * Updates the attendance list for the active report and marks draft state dirty.
     *
     * @param {SyntheticEvent} _event   The event source.
     * @param {User[]}         newValue The selected users from Autocomplete.
     */
    const handleAttendanceChange = (
        _event: SyntheticEvent,
        newValue: User[],
    ) => {
        if (!selectedReport) return;
        const newAttendees: ShiftReportAttendee[] = newValue.map((u) => ({
            userId: u._id,
            name: u.displayName || u.username,
            isManual: true,
        }));
        const updated = { ...selectedReport, attendees: newAttendees };
        setSelectedReport(updated);
        selectedReportRef.current = updated;
        setIsDirty(true);
        isDirtyRef.current = true;
    };

    // Organize reports into a hierarchical structure for the archive tree
    const organizedReports = reports.reduce<
        Record<string, Record<string, Record<string, ShiftReport[]>>>
    >((acc, report) => {
        const date = new Date(report.startTime);
        const year = String(date.getFullYear());
        const month = date.toLocaleString("default", { month: "long" });
        const day = format(date, "dd/MM/yyyy");

        if (!acc[year]) acc[year] = {};
        if (!acc[year][month]) acc[year][month] = {};
        if (!acc[year][month][day]) acc[year][month][day] = [];

        acc[year][month][day].push(report);
        return acc;
    }, {});

    /**
     * Toggles the expansion state of a year in the archive sidebar.
     * @param {string} year The year to toggle.
     */
    const toggleYear = (year: string) =>
        setOpenYears((prev) => ({ ...prev, [year]: !prev[year] }));

    /**
     * Toggles the expansion state of a month in the archive sidebar.
     * @param {string} key The unique year-month key.
     */
    const toggleMonth = (key: string) =>
        setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }));

    /**
     * Toggles the expansion state of a day in the archive sidebar.
     * @param {string} key The unique year-month-day key.
     */
    const toggleDay = (key: string) =>
        setOpenDays((prev) => ({ ...prev, [key]: !prev[key] }));

    if (!currentGroup)
        return (
            <Container>
                <Typography>Please select a group.</Typography>
            </Container>
        );

    return (
        <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
            {/* Header Section */}
            <Box
                sx={{
                    mb: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Shift Reports
                </Typography>
                <Typography variant="subtitle1" component="p" color="text.secondary">
                    Shift logs and operational handover reports.
                </Typography>
            </Box>

            <Grid container spacing={2} sx={{ height: "calc(85vh - 70px)" }}>
                {/* Sidebar */}
                <Grid size={{ xs: 12, md: 3 }} sx={{ height: { xs: "calc(100vh - 200px)", md: "100%" }, display: { xs: mobileSidebarOpen ? "block" : "none", md: "block" } }}>
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
                            <Typography
                                variant="h6"
                                component="h2"
                                fontWeight="bold"
                            >
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
                                                    organizedReports[year],
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
                                                                        monthKey,
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
                                                                        ][
                                                                            month
                                                                        ],
                                                                    ).map(
                                                                        (
                                                                            day,
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
                                                                                                dayKey,
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
                                                                                                    rep: ShiftReport,
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
                                                                                                        onClick={() => handleSelectReport(rep)}
                                                                                                    >
                                                                                                        <ListItemText
                                                                                                            primary={
                                                                                                                rep.title
                                                                                                            }
                                                                                                        />
                                                                                                        {isShiftManager && (
                                                                                                            <IconButton
                                                                                                                size="small"
                                                                                                                aria-label={`Delete report ${rep.title}`}
                                                                                                                onClick={(
                                                                                                                    e,
                                                                                                                ) => {
                                                                                                                    e.stopPropagation();
                                                                                                                    setDeleteReportId(
                                                                                                                        rep._id,
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
                                                                                                        )}
                                                                                                    </ListItemButton>
                                                                                                ),
                                                                                            )}
                                                                                        </List>
                                                                                    </Collapse>
                                                                                </Box>
                                                                            );
                                                                        },
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
                <Grid size={{ xs: 12, md: 9 }} sx={{ height: "100%", display: { xs: mobileSidebarOpen ? "none" : "block", md: "block" } }}>
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
                                <Box display="flex" alignItems="center">
                                    <IconButton
                                        onClick={() => setMobileSidebarOpen(true)}
                                        aria-label="Open reports archive"
                                        sx={{ display: { xs: "flex", md: "none" }, mr: 1 }}
                                    >
                                        <MenuIcon />
                                    </IconButton>
                                    <Typography
                                        variant="h4"
                                        component="h2"
                                        fontWeight="bold"
                                    >
                                        {selectedReport.title}
                                    </Typography>
                                    {isDirty && (
                                        <Chip
                                            label="Unsaved Changes"
                                            size="small"
                                            color="warning"
                                            variant="outlined"
                                            sx={{ ml: 2 }}
                                        />
                                    )}
                                </Box>
                                <Box>
                                    <Button
                                        variant="outlined"
                                        startIcon={<UndoIcon />}
                                        onClick={handleDiscardChanges}
                                        disabled={selectedReport.isLocked || !isDirty}
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
                                    height: "100%",
                                    bgcolor: "action.hover",
                                    p: 0,
                                    borderRadius: 2,
                                    borderRight: "4px solid",
                                    borderColor: "warning.main",
                                    overflow: "hidden",
                                }}
                            >
                                <Typography
                                    variant="subtitle2"
                                    component="h3"
                                    color="text.secondary"
                                    sx={{ p: 2, pb: 0 }}
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    Tasks from previous shift
                                </Typography>

                                <TiptapEditor
                                    key={`${selectedReport._id}-previousTasks`}
                                    value={selectedReport.previousTasks || ""}
                                    onChange={(value) => {
                                        setSelectedReport((prev) => {
                                            const next = prev
                                                ? {
                                                      ...prev,
                                                      previousTasks: value,
                                                  }
                                                : null;
                                            selectedReportRef.current = next;
                                            return next;
                                        });
                                        setIsDirty(true);
                                        isDirtyRef.current = true;
                                    }}
                                    readOnly={selectedReport.isLocked}
                                    placeholder="No tasks from previous shift"
                                />
                            </Box>

                            <Box mb={4}>
                                <Typography
                                    variant="h6"
                                    component="h3"
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    Shift Attendance
                                </Typography>
                                <Autocomplete<User, true, false, false>
                                    multiple
                                    options={groupUsers}
                                    getOptionLabel={(option) =>
                                        option.displayName || option.username
                                    }
                                    value={selectedReport.attendees
                                        .map((a: ShiftReportAttendee) =>
                                            groupUsers.find((u) => {
                                                const attendeeId =
                                                    typeof a.userId === "object" &&
                                                    a.userId !== null
                                                        ? (a.userId as { _id?: string })._id
                                                        : a.userId;
                                                return u._id === attendeeId;
                                            }),
                                        )
                                        .filter((u): u is User => Boolean(u))}
                                    onChange={handleAttendanceChange}
                                    disabled={selectedReport.isLocked}
                                    renderTags={(value, getTagProps) =>
                                        value.map((option, index) => {
                                            const { key, ...tagProps } =
                                                getTagProps({ index });
                                            return (
                                                <Chip
                                                    key={key}
                                                    label={option?.displayName || option?.username}
                                                    {...tagProps}
                                                />
                                            );
                                        })
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            variant="outlined"
                                            placeholder="Select workers..."
                                        />
                                    )}
                                />
                            </Box>

                            {/* Main container for the bottom area */}
                            <Box
                                sx={{
                                    height: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    mt: 4,
                                }}
                            >
                                <Typography
                                    variant="h6"
                                    component="h3"
                                    gutterBottom
                                    fontWeight="bold"
                                >
                                    Operations Log / Ongoing Tasks
                                </Typography>

                                <Box
                                    sx={{
                                        flexGrow: 1,
                                        height: "100%",
                                        overflow: "hidden",
                                        bgcolor: "background.paper",
                                        borderRadius: 1,
                                        border: 1,
                                        borderColor: "divider",
                                        display: "flex",
                                        flexDirection: "column",
                                    }}
                                >
                                    <TiptapEditor
                                        key={`${selectedReport._id}-currentTasks`}
                                        value={
                                            selectedReport.currentTasks || ""
                                        }
                                        onChange={(value) => {
                                            setSelectedReport((prev) => {
                                                const next = prev
                                                    ? {
                                                          ...prev,
                                                          currentTasks: value,
                                                      }
                                                    : null;
                                                selectedReportRef.current = next;
                                                return next;
                                            });
                                            setIsDirty(true);
                                            isDirtyRef.current = true;
                                        }}
                                        readOnly={selectedReport.isLocked}
                                        placeholder="Enter event details and tasks here..."
                                    />
                                </Box>
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
                            <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                                <IconButton
                                    onClick={() => setMobileSidebarOpen(true)}
                                    aria-label="Open reports archive"
                                    sx={{ display: { xs: "flex", md: "none" } }}
                                >
                                    <MenuIcon fontSize="large" />
                                </IconButton>
                                <Typography
                                    variant="h4"
                                    component="h2"
                                    color="text.secondary"
                                >
                                    Select a report to view details
                                </Typography>
                            </Box>
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

            <ConfirmDialog
                open={!!pendingSwitchReport}
                title="Unsaved Changes"
                content="You have unsaved changes in this shift report. Do you want to discard your changes and switch to another report?"
                onCancel={cancelSwitchReport}
                onConfirm={confirmSwitchReport}
            />
        </Container>
    );
}
