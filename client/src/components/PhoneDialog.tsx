/**
 * @module PhoneDialog
 *
 * Provides a modal interface for creating or editing phone records.
 * Handles input validation, dynamic number formatting based on phone type,
 * and multi-number management.
 */

import { useState } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    IconButton,
    FormHelperText,
    Typography,
    Alert,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import type { PhoneRow, PhoneType } from "../types";

/**
 * Props for the {@link PhoneDialog} component.
 */
interface PhoneDialogProps {
    /** Whether the dialog is currently visible. */
    open: boolean;
    /** Callback function to close the dialog. */
    onClose: () => void;
    /** 
     * Asynchronous callback triggered when the user saves the form.
     * Returns a promise to allow the dialog to handle server-side errors.
     */
    onSave: (phoneData: Partial<PhoneRow>) => Promise<void>;
    /** Optional initial data for populating the form in edit mode. */
    initialData?: PhoneRow | null;
}

/**
 * Generates a short unique identifier for local list management.
 * @returns {string} A random base-36 string.
 */
const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Renders a dialog with a form for managing phone entries.
 *
 * Supports adding multiple numbers for a single contact, with specific 
 * formatting rules for Mobile, Landline, Black (Secure), and Red (Emergency) phones.
 *
 * @param {PhoneDialogProps} props  The properties for the component.
 * @returns {JSX.Element}           The rendered dialog component.
 */
interface PhoneFormProps {
    initialData?: PhoneRow | null;
    onClose: () => void;
    onSave: (phoneData: Partial<PhoneRow>) => Promise<void>;
}

function PhoneForm({ initialData, onClose, onSave }: PhoneFormProps) {
    const [formData, setFormData] = useState(() => ({
        name: initialData?.name ?? "",
        numbers:
            initialData && initialData.numbers.length > 0
                ? initialData.numbers.map((num) => ({
                      id: generateId(),
                      value: num,
                  }))
                : [{ id: generateId(), value: "" }],
        type: (initialData?.type ?? "Mobile") as PhoneType,
        description: initialData?.description ?? "",
    }));

    const [errors, setErrors] = useState({
        name: false,
        type: false,
        numbers: false,
        description: false,
    });

    /** Stores error messages returned from the server (e.g., duplicate numbers). */
    const [serverError, setServerError] = useState<string | null>(null);

    /**
     * Applies type-specific formatting masks to raw digit strings.
     * 
     * @param {string} rawValue  The unformatted string from the input.
     * @param {PhoneType} type   The current phone type classification.
     * @returns {string}         The formatted string (e.g., "050-123-4567").
     */
    const formatAsYouType = (rawValue: string, type: PhoneType) => {
        const digits = rawValue.replace(/\D/g, "");
        let formatted = "";
        switch (type) {
            case "Black":
                if (digits.length > 4)
                    formatted = `${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
                else formatted = digits.slice(0, 8);
                break;
            case "Red":
                if (digits.length > 3)
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}`;
                else formatted = digits.slice(0, 7);
                break;
            case "Mobile":
                if (digits.length > 6)
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
                else if (digits.length > 3)
                    formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                else formatted = digits.slice(0, 10);
                break;
            case "Landline":
                if (digits.length > 2)
                    formatted = `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
                else formatted = digits.slice(0, 9);
                break;
            default:
                formatted = digits;
        }
        return formatted;
    };

    /**
     * Updates a specific number field in the local state.
     * @param {string} id     The unique ID of the field to update.
     * @param {string} value  The new value for the field.
     */
    const handleNumberChange = (id: string, value: string) => {
        const newNumbers = formData.numbers.map((item) => {
            if (item.id === id) {
                return {
                    ...item,
                    value: formatAsYouType(value, formData.type),
                };
            }
            return item;
        });
        setFormData({ ...formData, numbers: newNumbers });
    };

    /** Adds a new empty phone number field to the list. */
    const handleAddNumberField = () => {
        setFormData({
            ...formData,
            numbers: [...formData.numbers, { id: generateId(), value: "" }],
        });
    };

    /**
     * Removes a specific phone number field from the list.
     * @param {string} id  The unique ID of the field to remove.
     */
    const handleRemoveNumberField = (id: string) => {
        const newNumbers = formData.numbers.filter((item) => item.id !== id);
        setFormData({ ...formData, numbers: newNumbers });
    };

    /**
     * Updates the phone type and reapplies formatting to all existing numbers.
     * @param {PhoneType} newType  The new classification for the phone entry.
     */
    const handleTypeChange = (newType: PhoneType) => {
        const reFormatted = formData.numbers.map((item) => ({
            ...item,
            value: formatAsYouType(item.value, newType),
        }));
        setFormData({ ...formData, type: newType, numbers: reFormatted });
    };

    /**
     * Validates the form data and attempts to persist it via the onSave callback.
     * If saving fails, captures and displays server-side error messages.
     */
    const handleSubmit = async () => {
        setServerError(null);

        const rawNumbers = formData.numbers.map((n) => n.value);
        const filteredNumbers = rawNumbers.filter((n) => n.trim() !== "");

        const newErrors = {
            name: !formData.name.trim(),
            type: !formData.type,
            numbers: filteredNumbers.length === 0,
            description: !formData.description.trim(),
        };

        setErrors(newErrors);

        if (Object.values(newErrors).some((v) => v)) {
            return;
        }

        try {
            await onSave({ ...formData, numbers: filteredNumbers });
            onClose();
        } catch (err: unknown) {
            const message =
                typeof err === "object" &&
                err !== null &&
                "response" in err &&
                typeof (err as { response?: { data?: { message?: string } } }).response?.data?.message === "string"
                    ? (err as { response: { data: { message: string } } }).response.data.message
                    : err instanceof Error
                      ? err.message
                      : "Failed to save phone";
            setServerError(message);
        }
    };

    return (
        <>
            <DialogTitle id="phone-dialog-title">
                {initialData ? "Edit Phone Number" : "Add New Phone"}
            </DialogTitle>
            <DialogContent>
                {serverError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {serverError}
                    </Alert>
                )}

                <TextField
                    id="phone-name-input"
                    margin="dense"
                    label="Name *"
                    fullWidth
                    variant="outlined"
                    value={formData.name}
                    error={errors.name}
                    helperText={errors.name ? "Name is required" : ""}
                    inputProps={{ "aria-label": "Name" }}
                    onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                    }
                />

                <FormControl fullWidth margin="dense">
                    <InputLabel id="phone-type-label">Phone Type *</InputLabel>
                    <Select
                        labelId="phone-type-label"
                        id="phone-type-select"
                        value={formData.type}
                        label="Phone Type *"
                        inputProps={{ "aria-label": "Phone Type" }}
                        onChange={(e) =>
                            handleTypeChange(e.target.value as PhoneType)
                        }
                    >
                        <MenuItem value="Mobile">Mobile (Cellular)</MenuItem>
                        <MenuItem value="Landline">Landline (Fixed)</MenuItem>
                        <MenuItem value="Black">Black (Secure)</MenuItem>
                        <MenuItem value="Red">Red (Emergency)</MenuItem>
                    </Select>
                </FormControl>

                <Typography variant="subtitle2" component="p" sx={{ mt: 2, mb: 1 }}>
                    Phone Numbers *
                </Typography>

                {formData.numbers.map((item, index) => (
                    <Box key={item.id} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                        <TextField
                            id={`phone-number-input-${index + 1}`}
                            fullWidth
                            size="small"
                            type="tel"
                            value={item.value}
                            inputProps={{ "aria-label": `Phone number ${index + 1}` }}
                            onChange={(e) =>
                                handleNumberChange(item.id, e.target.value)
                            }
                            placeholder="Type number..."
                            error={errors.numbers && !item.value}
                        />
                        <IconButton
                            onClick={() => handleRemoveNumberField(item.id)}
                            disabled={formData.numbers.length <= 1}
                            color="error"
                            aria-label={`Remove phone number ${index + 1}`}
                            sx={{ minWidth: 44, minHeight: 44, p: 1.25 }}
                        >
                            <DeleteOutlineIcon />
                        </IconButton>
                    </Box>
                ))}

                <Button
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={handleAddNumberField}
                    size="small"
                    aria-label="Add another number"
                    sx={{ mb: 2, minHeight: 44, py: 1, px: 2 }}
                >
                    Add Another Number
                </Button>

                {errors.numbers && (
                    <FormHelperText error>
                        At least one valid number is required
                    </FormHelperText>
                )}

                <TextField
                    id="phone-description-input"
                    margin="dense"
                    label="Description *"
                    fullWidth
                    multiline
                    rows={2}
                    variant="outlined"
                    value={formData.description}
                    error={errors.description}
                    helperText={
                        errors.description ? "Description is required" : ""
                    }
                    inputProps={{ "aria-label": "Description" }}
                    onChange={(e) =>
                        setFormData({
                            ...formData,
                            description: e.target.value,
                        })
                    }
                />
            </DialogContent>

            <DialogActions sx={{ pb: 2, px: 3, gap: 1.5 }}>
                <Button
                    onClick={onClose}
                    color="inherit"
                    aria-label="Cancel"
                    sx={{ minHeight: 44, px: 2.5 }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    color="primary"
                    aria-label={initialData ? "Save Changes" : "Add Phone"}
                    sx={{ minHeight: 44, px: 2.5 }}
                >
                    {initialData ? "Save Changes" : "Add Phone"}
                </Button>
            </DialogActions>
        </>
    );
}

/**
 * Renders a dialog with a form for managing phone entries.
 *
 * Supports adding multiple numbers for a single contact, with specific 
 * formatting rules for Mobile, Landline, Black (Secure), and Red (Emergency) phones.
 *
 * @param {PhoneDialogProps} props  The properties for the component.
 * @returns {JSX.Element}           The rendered dialog component.
 */
export default function PhoneDialog({
    open,
    onClose,
    onSave,
    initialData,
}: PhoneDialogProps) {
    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            aria-labelledby="phone-dialog-title"
        >
            {open && (
                <PhoneForm
                    key={initialData?._id ?? "new"}
                    initialData={initialData}
                    onClose={onClose}
                    onSave={onSave}
                />
            )}
        </Dialog>
    );
}
