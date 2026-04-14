/**
 * @module ShiftTypesTab
 * 
 * Provides a management interface for custom shift types within a group.
 * Allows administrators to create, edit, and delete shift types, including
 * setting display colors and defining if a shift should impact vacation balances.
 */

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
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import ConfirmDialog from "../ConfirmDialog";
import type { ShiftType } from "../../types";
import axios from "axios";

/**
 * Renders the shift types management tab.
 * 
 * Handles the CRUD operations for shift types by updating the group's 
 * settings on the server. Includes validation for duplicate names and
 * confirmation for deletions.
 * 
 * @returns {JSX.Element} The rendered ShiftTypesTab component.
 */
export default function ShiftTypesTab() {
    const { currentGroup } = useUser();
    const { groups, refreshData } = useData();
    const { showNotification } = useNotification();

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id),
    )?.settings;
    const shiftTypes = groupSettings?.shiftTypes || [];

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<ShiftType | null>(null);

    /** @type {string | null} Tracks the ID of a shift type slated for deletion to trigger confirmation. */
    const [deleteId, setDeleteId] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        color: "#000000",
        isVacation: false,
    });

    /**
     * Initializes the dialog for creating or editing a shift type.
     * 
     * @param {ShiftType} [type]  The shift type to edit. If omitted, sets up for a new entry.
     */
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

    /**
     * Persists the current form data as a new or updated shift type.
     * 
     * Validates that the name is present and unique within the group.
     * 
     * @returns {Promise<void>}
     */
    const handleSave = async () => {
        if (!currentGroup) return;
        if (!formData.name.trim()) return alert("Name is required");

        // Validate uniqueness of shift type name
        const isDuplicate = shiftTypes.some(
            (t) =>
                t.name.trim() === formData.name.trim() &&
                t._id !== editingType?._id, // Avoid self-comparison during edit
        );

        if (isDuplicate) {
            return showNotification(
                "Error: A shift type with this name already exists",
                "error",
            );
        }

        try {
            let updatedTypes = [...shiftTypes];

            if (editingType) {
                updatedTypes = updatedTypes.map((t) =>
                    t._id === editingType._id ? { ...t, ...formData } : t,
                );
            } else {
                updatedTypes.push({ ...formData } as ShiftType);
            }

            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    shiftTypes: updatedTypes,
                },
            );

            showNotification("Shift types updated successfully", "success");
            refreshData();
            setIsDialogOpen(false);
        } catch (error) {
            console.error(error);
            showNotification("Error saving settings", "error");
        }
    };

    /**
     * Initiates the deletion flow by setting the target ID.
     * 
     * @param {string} id  The unique identifier of the shift type to delete.
     */
    const handleDeleteClick = (id: string) => {
        setDeleteId(id);
    };

    /**
     * Confirms and executes the removal of a shift type.
     * 
     * Filters the shift types list and updates group settings on the server.
     * 
     * @returns {Promise<void>}
     */
    const handleConfirmDelete = async () => {
        if (!deleteId || !currentGroup) return;

        try {
            const updatedTypes = shiftTypes.filter((t) => t._id !== deleteId);

            await axios.put(
                `/api/groups/${currentGroup._id || currentGroup.id}/settings`,
                {
                    ...groupSettings,
                    shiftTypes: updatedTypes,
                },
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
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                }}
                            >
                                Color:
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
                            </label>
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
