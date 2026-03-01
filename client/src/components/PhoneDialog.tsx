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
    Alert, // הוספנו Alert להצגת שגיאות שרת
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import type { PhoneRow, PhoneType } from "../types";

interface PhoneDialogProps {
    open: boolean;
    onClose: () => void;
    // שינינו את onSave שיחזיר Promise כדי שנדע אם הצליח או נכשל
    onSave: (phoneData: Partial<PhoneRow>) => Promise<void>;
    initialData?: PhoneRow | null;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function PhoneDialog({
    open,
    onClose,
    onSave,
    initialData,
}: PhoneDialogProps) {
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

    // State לשגיאה כללית מהשרת (כמו "מספר כפול")
    const [serverError, setServerError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setServerError(null); // איפוס שגיאות בפתיחה
            if (initialData) {
                setFormData({
                    name: initialData.name,
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
        }
    }, [initialData, open]);

    // ... פונקציית formatAsYouType נשארת ללא שינוי ...
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
        // --- שינוי: הסרנו את הקוד שמחק מספרים אם הסוג הוא Mobile/Landline ---
        // כעת אנחנו פשוט מעדכנים את הפורמט של המספרים הקיימים לסוג החדש
        const reFormatted = formData.numbers.map((item) => ({
            ...item,
            value: formatAsYouType(item.value, newType), // שימוש בפונקציה הקיימת שלך לפורמט מחדש
        }));
        setFormData({ ...formData, type: newType, numbers: reFormatted });
    };

    const handleSubmit = async () => {
        setServerError(null); // איפוס שגיאות קודמות

        const rawNumbers = formData.numbers.map((n) => n.value);
        // סינון מספרים ריקים במקרה שהמשתמש השאיר שדה ריק
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
            // ממתינים לתשובת השרת
            await onSave({ ...formData, numbers: filteredNumbers });
            // אם הכל עבר בשלום - סוגרים
            onClose();
        } catch (err: any) {
            // אם השרת החזיר שגיאה (למשל: מספר כפול), נציג אותה ולא נסגור את הדיאלוג
            setServerError(
                err.response?.data?.message || "Failed to save phone",
            );
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Phone Number" : "Add New Phone"}
            </DialogTitle>
            <DialogContent>
                {/* הצגת שגיאת שרת אם יש */}
                {serverError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {serverError}
                    </Alert>
                )}

                <TextField
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
                        {/* תמיד מאפשרים מחיקה אם יש יותר מאחד, או אפילו אם יש אחד והמשתמש רוצה לנקות */}
                        <IconButton
                            onClick={() => handleRemoveNumberField(item.id)}
                            disabled={formData.numbers.length <= 1} // משביתים אם נשאר רק אחד
                            color="error"
                        >
                            <DeleteOutlineIcon />
                        </IconButton>
                    </Box>
                ))}

                {/* --- שינוי: הכפתור מוצג תמיד, לכל הסוגים --- */}
                <Button
                    startIcon={<AddCircleOutlineIcon />}
                    onClick={handleAddNumberField}
                    size="small"
                    sx={{ mb: 2 }}
                >
                    Add Another Number
                </Button>

                {errors.numbers && (
                    <FormHelperText error>
                        At least one valid number is required
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
