import { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
} from "@mui/material";
import type { SiteCard } from "../types";

interface SiteDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (siteData: Partial<SiteCard>) => void;
    initialData?: SiteCard | null;
}

export default function SiteDialog({
    open,
    onClose,
    onSave,
    initialData,
}: SiteDialogProps) {
    const [formData, setFormData] = useState({
        title: "",
        url: "",
        imageUrl: "",
        description: "",
        // מועדפים הוסר מכאן
    });

    // ניהול שגיאות
    const [errors, setErrors] = useState({ title: false, url: false });

    useEffect(() => {
        if (initialData) {
            setFormData({
                title: initialData.title,
                url: initialData.url,
                imageUrl: initialData.imageUrl,
                description: initialData.description,
            });
        } else {
            setFormData({ title: "", url: "", imageUrl: "", description: "" });
        }
        setErrors({ title: false, url: false }); // איפוס שגיאות
    }, [initialData, open]);

    const handleSubmit = () => {
        // ולידציה: שם וכתובת חובה
        const newErrors = {
            title: !formData.title.trim(),
            url: !formData.url.trim(),
        };
        setErrors(newErrors);

        if (newErrors.title || newErrors.url) return; // עצירה אם יש שגיאה

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
                <TextField
                    margin="dense"
                    label="Image URL"
                    fullWidth
                    variant="outlined"
                    placeholder="https://example.com/image.jpg"
                    value={formData.imageUrl}
                    onChange={(e) =>
                        setFormData({ ...formData, imageUrl: e.target.value })
                    }
                />
                <TextField
                    margin="dense"
                    label="Description"
                    fullWidth
                    multiline
                    rows={3}
                    variant="outlined"
                    value={formData.description}
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
