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
} from "@mui/material";
import type { SiteCard, Group } from "../types";

interface SiteDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (siteData: Partial<SiteCard>) => void;
    initialData?: SiteCard | null;
    currentGroup?: Group | null;
}

export default function SiteDialog({
    open,
    onClose,
    onSave,
    initialData,
    currentGroup,
}: SiteDialogProps) {
    const [formData, setFormData] = useState({
        title: "",
        url: "",
        imageUrl: "",
        description: "",
        tag: "General",
    });

    // הוספת בדיקות שגיאה לשדות החדשים
    const [errors, setErrors] = useState({
        title: false,
        url: false,
        imageUrl: false,
        description: false,
    });

    const availableTags =
        currentGroup?.siteTags && currentGroup.siteTags.length > 0
            ? currentGroup.siteTags
            : ["General"];

    useEffect(() => {
        if (initialData) {
            setFormData({
                title: initialData.title,
                url: initialData.url,
                imageUrl: initialData.imageUrl,
                description: initialData.description,
                tag: initialData.tag || "General",
            });
        } else {
            setFormData({
                title: "",
                url: "",
                imageUrl: "",
                description: "",
                tag: "General",
            });
        }
        setErrors({
            title: false,
            url: false,
            imageUrl: false,
            description: false,
        });
    }, [initialData, open]);

    const handleSubmit = () => {
        // ולידציה לכל השדות
        const newErrors = {
            title: !formData.title.trim(),
            url: !formData.url.trim(),
            imageUrl: !formData.imageUrl.trim(),
            description: !formData.description.trim(),
        };
        setErrors(newErrors);

        // אם יש שגיאה כלשהי, עוצרים
        if (Object.values(newErrors).some(Boolean)) return;

        onSave(formData);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {initialData ? "Edit Site" : "Add New Site"}
            </DialogTitle>

            <DialogContent>
                <TextField
                    autoFocus
                    margin="dense"
                    label="Site Name *"
                    fullWidth
                    variant="outlined"
                    value={formData.title}
                    error={errors.title}
                    helperText={errors.title ? "Name is required" : ""}
                    onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                    }
                />
                <TextField
                    margin="dense"
                    label="URL (Link) *"
                    fullWidth
                    variant="outlined"
                    value={formData.url}
                    error={errors.url}
                    helperText={errors.url ? "URL is required" : ""}
                    onChange={(e) =>
                        setFormData({ ...formData, url: e.target.value })
                    }
                />

                <FormControl fullWidth margin="dense">
                    <InputLabel>Tag</InputLabel>
                    <Select
                        value={formData.tag}
                        label="Tag"
                        onChange={(e) =>
                            setFormData({ ...formData, tag: e.target.value })
                        }
                    >
                        {availableTags.map((tag) => (
                            <MenuItem key={tag} value={tag}>
                                {tag}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <TextField
                    margin="dense"
                    label="Image URL *"
                    fullWidth
                    variant="outlined"
                    placeholder="https://example.com/image.jpg"
                    value={formData.imageUrl}
                    error={errors.imageUrl}
                    helperText={errors.imageUrl ? "Image URL is required" : ""}
                    onChange={(e) =>
                        setFormData({ ...formData, imageUrl: e.target.value })
                    }
                />
                <TextField
                    margin="dense"
                    label="Description *"
                    fullWidth
                    multiline
                    rows={3}
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
                    {initialData ? "Save Changes" : "Create Site"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
