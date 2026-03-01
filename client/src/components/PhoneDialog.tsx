import { useState, useEffect } from "react";
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
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import type { PhoneRow, PhoneType } from "../types";

interface PhoneDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (phoneData: Partial<PhoneRow>) => void;
    initialData?: PhoneRow | null;
}

// עזר ליצירת מזהים ייחודיים לשדות
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function PhoneDialog({
    open,
    onClose,
    onSave,
    initialData,
}: PhoneDialogProps) {
    // שינוי מבנה ה-State: המספרים הם כעת אובייקטים עם id
    const [formData, setFormData] = useState({
        name: "",
        numbers: [{ id: generateId(), value: "" }],
        type: "Mobile" as PhoneType,
        description: "",
    });

    const [errors, setErrors] = useState({
        name: false,
        type: false,
        numbers: false,
        description: false,
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                // המרה ממערך מחרוזות למערך אובייקטים בטעינה
                numbers:
                    initialData.numbers.length > 0
                        ? initialData.numbers.map((num) => ({
                              id: generateId(),
                              value: num,
                          }))
                        : [{ id: generateId(), value: "" }],
                type: initialData.type,
                description: initialData.description,
            });
        } else {
            setFormData({
                name: "",
                numbers: [{ id: generateId(), value: "" }],
                type: "Mobile",
                description: "",
            });
        }
        setErrors({
            name: false,
            type: false,
            numbers: false,
            description: false,
        });
    }, [initialData, open]);

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

    const handleAddNumberField = () => {
        setFormData({
            ...formData,
            numbers: [...formData.numbers, { id: generateId(), value: "" }],
        });
    };

    const handleRemoveNumberField = (id: string) => {
        const newNumbers = formData.numbers.filter((item) => item.id !== id);
        setFormData({ ...formData, numbers: newNumbers });
    };

    const handleTypeChange = (newType: PhoneType) => {
        let currentNumbers = [...formData.numbers];
        if (newType === "Mobile" || newType === "Landline") {
            // משאירים רק את האיבר הראשון
            currentNumbers = [
                currentNumbers[0] || { id: generateId(), value: "" },
            ];
        }

        const reFormatted = currentNumbers.map((item) => ({
            ...item,
            value: formatAsYouType(item.value, newType),
        }));
        setFormData({ ...formData, type: newType, numbers: reFormatted });
    };

    const handleSubmit = () => {
        // המרה חזרה למחרוזות לפני שמירה
        const rawNumbers = formData.numbers.map((n) => n.value);
        const hasEmptyNumber = rawNumbers.some((n) => !n.trim());

        const newErrors = {
            name: !formData.name.trim(),
            type: !formData.type,
            numbers: rawNumbers.length === 0 || hasEmptyNumber,
            description: !formData.description.trim(),
        };

        setErrors(newErrors);

        if (
            newErrors.name ||
            newErrors.type ||
            newErrors.numbers ||
            newErrors.description
        ) {
            return;
        }

        // שליחה של המידע בפורמט שהאבא מצפה לו (מערך מחרוזות)
        onSave({ ...formData, numbers: rawNumbers });
        onClose();
    };

    const canAddMultiple = formData.type === "Black" || formData.type === "Red";

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Phone Number" : "Add New Phone"}
            </DialogTitle>
            <DialogContent>
                <TextField
                    // הסרתי את autoFocus כדי לפתור את בעיית הנגישות, אפשר להחזיר אם זה קריטי ל-UX
                    margin="dense"
                    label="Name *"
                    fullWidth
                    variant="outlined"
                    value={formData.name}
                    error={errors.name}
                    helperText={errors.name ? "Name is required" : ""}
                    onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                    }
                />

                <FormControl fullWidth margin="dense">
                    <InputLabel>Phone Type *</InputLabel>
                    <Select
                        value={formData.type}
                        label="Phone Type *"
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

                <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                    Phone Numbers *
                </Typography>

                {formData.numbers.map((item) => (
                    <Box key={item.id} sx={{ display: "flex", gap: 1, mb: 1 }}>
                        <TextField
                            fullWidth
                            size="small"
                            value={item.value}
                            onChange={(e) =>
                                handleNumberChange(item.id, e.target.value)
                            }
                            placeholder="Type number..."
                            error={errors.numbers && !item.value}
                        />
                        {formData.numbers.length > 1 && (
                            <IconButton
                                onClick={() => handleRemoveNumberField(item.id)}
                                color="error"
                            >
                                <DeleteOutlineIcon />
                            </IconButton>
                        )}
                    </Box>
                ))}

                {canAddMultiple && (
                    <Button
                        startIcon={<AddCircleOutlineIcon />}
                        onClick={handleAddNumberField}
                        size="small"
                        sx={{ mb: 2 }}
                    >
                        Add Another Number
                    </Button>
                )}

                {errors.numbers && (
                    <FormHelperText error>
                        All number fields must be filled
                    </FormHelperText>
                )}

                <TextField
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
                    onChange={(e) =>
                        setFormData({
                            ...formData,
                            description: e.target.value,
                        })
                    }
                />
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} color="inherit">
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    color="primary"
                >
                    {initialData ? "Save Changes" : "Add Phone"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
