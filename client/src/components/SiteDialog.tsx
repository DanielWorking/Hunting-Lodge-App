/**
 * @module SiteDialog
 *
 * Provides a modal form for creating or editing site entries.
 * Includes validation for required fields and dynamic tag selection based on the current group's configuration.
 */

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

/**
 * Props for the {@link SiteDialog} component.
 */
interface SiteDialogProps {
    /** Whether the dialog is currently visible. */
    open: boolean;
    /** Callback function to close the dialog. */
    onClose: () => void;
    /** Callback function triggered when the form is submitted and validated. */
    onSave: (siteData: Partial<SiteCard>) => void;
    /** Optional existing site data for pre-populating the form in edit mode. */
    initialData?: SiteCard | null;
    /** The active group context, used to retrieve available site tags. */
    currentGroup?: Group | null;
}

/**
 * Renders a dialog with a form for managing site information.
 *
 * Handles state for site attributes (title, URL, image, description, and tags)
 * and performs basic validation before persisting changes.
 *
 * @param {SiteDialogProps} props  The properties for the component.
 * @returns {JSX.Element}           The rendered SiteDialog component.
 */
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

    const [errors, setErrors] = useState({
        title: false,
        url: false,
        description: false,
    });

    /**
     * Derives the list of available tags from the current group context.
     * Defaults to ["General"] if no group-specific tags are defined.
     */
    const availableTags =
        currentGroup?.siteTags && currentGroup.siteTags.length > 0
            ? currentGroup.siteTags
            : ["General"];

    /**
     * Synchronizes the internal form state with provided initial data or resets it
     * whenever the dialog visibility or source data changes.
     */
    useEffect(() => {
        if (initialData) {
            setFormData({
                title: initialData.title,
                url: initialData.url,
                imageUrl: initialData.imageUrl || "",
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
            description: false,
        });
    }, [initialData, open]);

    /**
     * Validates required fields and invokes the onSave callback if the form is valid.
     */
    const handleSubmit = () => {
        // Validate all mandatory fields
        const newErrors = {
            title: !formData.title.trim(),
            url: !formData.url.trim(),
            description: !formData.description.trim(),
        };
        setErrors(newErrors);

        // Abort submission if any validation errors are present
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
