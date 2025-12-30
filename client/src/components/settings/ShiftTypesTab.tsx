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
    Checkbox,
    FormControlLabel,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import ConfirmDialog from "../ConfirmDialog"; // <-- Import
import type { ShiftType } from "../../types";
import axios from "axios";

export default function ShiftTypesTab() {
    const { currentGroup } = useUser();
    const { groups, refreshData } = useData();
    const { showNotification } = useNotification();

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id)
    )?.settings;
    const shiftTypes = groupSettings?.shiftTypes || [];

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<ShiftType | null>(null);

    // State למחיקה
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        color: "#000000",
        isVacation: false,
    });

    const handleOpenDialog = (type?: ShiftType) => {
        if (type) {
            setEditingType(type);
            setFormData({
                name: type.name,
                color: type.color,
                isVacation: type.isVacation,
            });
        } else {
            setEditingType(null);
            setFormData({ name: "", color: "#ff9800", isVacation: false });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!currentGroup) return;
        if (!formData.name.trim()) return alert("Name is required"); // כאן זה בסדר להשאיר alert או להחליף ב-notification אם תרצה

        try {
            let updatedTypes = [...shiftTypes];

            if (editingType) {
                updatedTypes = updatedTypes.map((t) =>
                    t._id === editingType._id ? { ...t, ...formData } : t
                );
            } else {
                updatedTypes.push({ ...formData } as ShiftType);
            }

            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    shiftTypes: updatedTypes,
                }
            );

            showNotification("Shift types updated successfully", "success");
            refreshData();
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            showNotification("Error saving settings", "error");
        }
    };

    // 1. פתיחת הדיאלוג
    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
    };

    // 2. ביצוע המחיקה
    const handleConfirmDelete = async () => {
        if (!deleteId || !currentGroup) return;

        try {
            const updatedTypes = shiftTypes.filter((t) => t._id !== deleteId);

            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    shiftTypes: updatedTypes,
                }
            );

            showNotification("Shift type deleted", "success");
            refreshData();
        } catch (error) {
            showNotification("Error deleting", "error");
        } finally {
            setDeleteId(null);
        }
    };

    return (
        <Box p={3}>
            <Box display="flex" justifyContent="space-between" mb={2}>
                <h3>Manage Shift Types</h3>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    Add Type
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Color</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Is Vacation?</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shiftTypes.map((type) => (
                            <TableRow key={type._id}>
                                <TableCell>
                                    <CircleIcon
                                        sx={{
                                            color: type.color,
                                            stroke: "grey",
                                            strokeWidth: 1,
                                        }}
                                    />
                                </TableCell>
                                <TableCell sx={{ fontWeight: "bold" }}>
                                    {type.name}
                                </TableCell>
                                <TableCell>
                                    {type.isVacation ? "✅ Yes" : "No"}
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton
                                        onClick={() => handleOpenDialog(type)}
                                    >
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton
                                        onClick={() =>
                                            handleDeleteClick(type._id)
                                        }
                                        color="error"
                                    >
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                        {shiftTypes.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} align="center">
                                    No shift types defined.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>
                    {editingType ? "Edit Shift Type" : "New Shift Type"}
                </DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Name"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    name: e.target.value,
                                })
                            }
                            fullWidth
                        />

                        <Box display="flex" alignItems="center" gap={2}>
                            <label>Color:</label>
                            <input
                                type="color"
                                value={formData.color}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        color: e.target.value,
                                    })
                                }
                                style={{
                                    width: "50px",
                                    height: "40px",
                                    cursor: "pointer",
                                }}
                            />
                        </Box>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={formData.isVacation}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            isVacation: e.target.checked,
                                        })
                                    }
                                />
                            }
                            label="Reduces Vacation Balance?"
                        />
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

            {/* הדיאלוג החדש */}
            <ConfirmDialog
                open={!!deleteId}
                title="Delete Shift Type"
                content="Are you sure? Existing schedule might be affected."
                onCancel={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
            />
        </Box>
    );
}
