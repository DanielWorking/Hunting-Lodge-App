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

export default function PhoneDialog({
    open,
    onClose,
    onSave,
    initialData,
}: PhoneDialogProps) {
    const [formData, setFormData] = useState({
        name: "",
        numbers: [""], // מתחילים עם מערך של מספר אחד ריק
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
                numbers:
                    initialData.numbers.length > 0 ? initialData.numbers : [""],
                type: initialData.type,
                description: initialData.description,
            });
        } else {
            setFormData({
                name: "",
                numbers: [""],
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

    // לוגיקת הפירמוט (נשארת זהה, פשוט מופעלת על אינדקס ספציפי)
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
                    formatted = `${digits.slice(0, 3)}-${digits.slice(
                        3,
                        6
                    )}-${digits.slice(6, 10)}`;
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

    // שינוי מספר ספציפי במערך
    const handleNumberChange = (index: number, value: string) => {
        const newNumbers = [...formData.numbers];
        newNumbers[index] = formatAsYouType(value, formData.type);
        setFormData({ ...formData, numbers: newNumbers });
    };

    // הוספת שדה מספר חדש
    const handleAddNumberField = () => {
        setFormData({ ...formData, numbers: [...formData.numbers, ""] });
    };

    // מחיקת שדה מספר
    const handleRemoveNumberField = (index: number) => {
        const newNumbers = formData.numbers.filter((_, i) => i !== index);
        setFormData({ ...formData, numbers: newNumbers });
    };

    // שינוי סוג הטלפון (מאפס למספר אחד ומפרמט אותו)
    const handleTypeChange = (newType: PhoneType) => {
        // אם עוברים מסוג מרובה לסוג יחיד, משאירים רק את המספר הראשון
        let currentNumbers = [...formData.numbers];
        if (newType === "Mobile" || newType === "Landline") {
            currentNumbers = [currentNumbers[0] || ""];
        }

        // מפרמטים מחדש את המספרים שנשארו
        const reFormatted = currentNumbers.map((num) =>
            formatAsYouType(num, newType)
        );
        setFormData({ ...formData, type: newType, numbers: reFormatted });
    };

    const handleSubmit = () => {
        // בדיקת שדות חובה
        const hasEmptyNumber = formData.numbers.some((n) => !n.trim());

        const newErrors = {
            name: !formData.name.trim(),
            type: !formData.type,
            numbers: formData.numbers.length === 0 || hasEmptyNumber,
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

        onSave(formData);
        onClose();
    };

    // האם מותר להוסיף עוד מספרים? (רק בשחור ואדום)
    const canAddMultiple = formData.type === "Black" || formData.type === "Red";

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Phone Number" : "Add New Phone"}
            </DialogTitle>
            <DialogContent>
                <TextField
                    autoFocus
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

                {formData.numbers.map((num, index) => (
                    <Box key={index} sx={{ display: "flex", gap: 1, mb: 1 }}>
                        <TextField
                            fullWidth
                            size="small"
                            value={num}
                            onChange={(e) =>
                                handleNumberChange(index, e.target.value)
                            }
                            placeholder="Type number..."
                            error={errors.numbers && !num}
                        />
                        {/* כפתור מחיקה - מופיע רק אם יש יותר ממספר אחד */}
                        {formData.numbers.length > 1 && (
                            <IconButton
                                onClick={() => handleRemoveNumberField(index)}
                                color="error"
                            >
                                <DeleteOutlineIcon />
                            </IconButton>
                        )}
                    </Box>
                ))}

                {/* כפתור הוספה - מופיע רק בסוגים המותרים */}
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
