import { useState } from "react";
import {
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Chip,
    OutlinedInput,
    Checkbox,
    ListItemText,
    Typography,
    Alert,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import ConfirmDialog from "../ConfirmDialog";
import type { TimeSlot } from "../../types";
import axios from "axios";

export default function TimeSlotsTab() {
    const { currentGroup } = useUser();
    const { groups, refreshData } = useData();
    const { showNotification } = useNotification();

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id)
    )?.settings;
    const timeSlots = groupSettings?.timeSlots || [];
    const shiftTypes = groupSettings?.shiftTypes || [];

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSlot, setEditingSlot] = useState<TimeSlot | null>(null);

    const [deleteId, setDeleteId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        startTime: "08:00",
        endTime: "16:00",
        linkedShiftTypes: [] as string[],
    });

    const handleOpenDialog = (slot?: TimeSlot) => {
        if (slot) {
            setEditingSlot(slot);
            setFormData({
                name: slot.name,
                startTime: slot.startTime,
                endTime: slot.endTime,
                linkedShiftTypes: slot.linkedShiftTypes || [],
            });
        } else {
            setEditingSlot(null);
            setFormData({
                name: "",
                startTime: "08:00", // ברירת מחדל
                endTime: "08:00", // ברירת מחדל ל-24 שעות כדי להקל
                linkedShiftTypes: [],
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!currentGroup) return;
        if (!formData.name.trim()) return alert("Name is required");

        try {
            let updatedSlots = [...timeSlots];

            if (editingSlot) {
                updatedSlots = updatedSlots.map((s) =>
                    s._id === editingSlot._id ? { ...s, ...formData } : s
                );
            } else {
                updatedSlots.push({ ...formData } as TimeSlot);
            }

            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    timeSlots: updatedSlots,
                }
            );

            showNotification("Time slots updated", "success");
            refreshData();
            setIsDialogOpen(false);
        } catch (error) {
            showNotification("Error saving slots", "error");
        }
    };

    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
    };

    const handleConfirmDelete = async () => {
        if (!deleteId || !currentGroup) return;

        try {
            const updatedSlots = timeSlots.filter((s) => s._id !== deleteId);
            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    timeSlots: updatedSlots,
                }
            );
            showNotification("Slot deleted", "success");
            refreshData();
        } catch (error) {
            showNotification("Error deleting", "error");
        } finally {
            setDeleteId(null);
        }
    };

    const getShiftTypeName = (id: string) => {
        return shiftTypes.find((t) => t._id === id)?.name || id;
    };

    // --- חישוב משך הזמן לתצוגה ---
    const calculateDuration = () => {
        if (!formData.startTime || !formData.endTime) return null;

        const [startH, startM] = formData.startTime.split(":").map(Number);
        const [endH, endM] = formData.endTime.split(":").map(Number);

        const startTotal = startH * 60 + startM;
        let endTotal = endH * 60 + endM;
        let label = "";
        let color = "text.secondary";

        // לוגיקה חכמה לזיהוי יממה
        if (endTotal < startTotal) {
            endTotal += 1440; // הוספת 24 שעות (יום למחרת)
            label = "(Ends next day)";
            color = "warning.main";
        } else if (endTotal === startTotal) {
            endTotal += 1440; // הוספת 24 שעות (יום מלא)
            label = "(Full 24 Hours)";
            color = "success.main";
        }

        const diff = endTotal - startTotal;
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;

        return (
            <Box display="flex" alignItems="center" gap={1} mt={1}>
                <AccessTimeIcon fontSize="small" sx={{ color }} />
                <Typography variant="body2" sx={{ color, fontWeight: "bold" }}>
                    Duration: {hours}h {minutes > 0 ? `${minutes}m` : ""}{" "}
                    {label}
                </Typography>
            </Box>
        );
    };

    return (
        <Box p={3}>
            <Box display="flex" justifyContent="space-between" mb={2}>
                <h3>Manage Report Time Slots</h3>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    Add Slot
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Time</TableCell>
                            <TableCell>Linked Shifts (Auto-Fill)</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {timeSlots.map((slot) => (
                            <TableRow key={slot._id}>
                                <TableCell sx={{ fontWeight: "bold" }}>
                                    {slot.name}
                                </TableCell>
                                <TableCell>
                                    {slot.startTime} - {slot.endTime}
                                    {/* תצוגה מקוצרת גם בטבלה */}
                                    {slot.startTime === slot.endTime && (
                                        <Typography
                                            variant="caption"
                                            display="block"
                                            color="success.main"
                                        >
                                            (24h)
                                        </Typography>
                                    )}
                                    {slot.endTime < slot.startTime && (
                                        <Typography
                                            variant="caption"
                                            display="block"
                                            color="warning.main"
                                        >
                                            (Overnight)
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {slot.linkedShiftTypes?.map((id) => (
                                        <Chip
                                            key={id}
                                            label={getShiftTypeName(id)}
                                            size="small"
                                            sx={{ mr: 0.5 }}
                                        />
                                    ))}
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton
                                        onClick={() => handleOpenDialog(slot)}
                                    >
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton
                                        onClick={() =>
                                            handleDeleteClick(slot._id)
                                        }
                                        color="error"
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {timeSlots.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    No time slots defined.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {editingSlot ? "Edit Time Slot" : "New Time Slot"}
                </DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Slot Name (e.g. Vacation / Morning)"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    name: e.target.value,
                                })
                            }
                            fullWidth
                        />

                        <Box
                            sx={{
                                p: 2,
                                border: "1px solid #eee",
                                borderRadius: 1,
                                bgcolor: "background.default",
                            }}
                        >
                            <Box display="flex" gap={2}>
                                <TextField
                                    label="Start Time"
                                    type="time"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.startTime}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            startTime: e.target.value,
                                        })
                                    }
                                />
                                <TextField
                                    label="End Time"
                                    type="time"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.endTime}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            endTime: e.target.value,
                                        })
                                    }
                                />
                            </Box>

                            {/* כאן מופיע החישוב האוטומטי */}
                            {calculateDuration()}
                        </Box>

                        <FormControl fullWidth>
                            <InputLabel>Linked Shift Types</InputLabel>
                            <Select
                                multiple
                                value={formData.linkedShiftTypes}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData({
                                        ...formData,
                                        linkedShiftTypes:
                                            typeof val === "string"
                                                ? val.split(",")
                                                : val,
                                    });
                                }}
                                input={
                                    <OutlinedInput label="Linked Shift Types" />
                                }
                                renderValue={(selected) =>
                                    selected
                                        .map((id) => getShiftTypeName(id))
                                        .join(", ")
                                }
                            >
                                {shiftTypes.map((type) => (
                                    <MenuItem key={type._id} value={type._id}>
                                        <Checkbox
                                            checked={
                                                formData.linkedShiftTypes.indexOf(
                                                    type._id
                                                ) > -1
                                            }
                                        />
                                        <ListItemText primary={type.name} />
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} variant="contained">
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!deleteId}
                title="Delete Time Slot"
                content="Are you sure? This might affect auto-population of future reports."
                onCancel={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
            />
        </Box>
    );
}
