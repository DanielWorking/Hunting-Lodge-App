/**
 * @module ConfirmDialog
 *
 * A reusable confirmation modal component used to verify user intent before 
 * performing critical or destructive actions (e.g., deletions).
 */

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    DialogContentText,
} from "@mui/material";

/**
 * Configuration properties for the {@link ConfirmDialog} component.
 */
interface ConfirmDialogProps {
    /** Whether the dialog is currently visible. */
    open: boolean;
    /** The text to display in the dialog title. */
    title: string;
    /** The detailed message or question to display in the dialog body. */
    content: string;
    /** Callback function executed when the user confirms the action. */
    onConfirm: () => void;
    /** Callback function executed when the user cancels or closes the dialog. */
    onCancel: () => void;
    /** 
     * The label for the confirmation button. 
     * @default "Confirm Delete"
     */
    confirmText?: string;
    /** 
     * The Material-UI color theme for the confirmation button.
     * @default "error"
     */
    confirmColor?: "error" | "primary" | "success" | "info";
}

/**
 * Renders a standardized confirmation dialog with customizable labels and themes.
 *
 * This component handles the presentation of a "Cancel/Confirm" choice, 
 * allowing the parent component to handle the resulting logic.
 *
 * @param {ConfirmDialogProps} props  The properties for the component.
 * @returns {JSX.Element}             The rendered dialog component.
 */
export default function ConfirmDialog({
    open,
    title,
    content,
    onConfirm,
    onCancel,
    confirmText = "Confirm Delete",
    confirmColor = "error",
}: ConfirmDialogProps) {
    return (
        <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: "bold" }}>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText>{content}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="inherit">
                    Cancel
                </Button>
                <Button
                    onClick={onConfirm}
                    color={confirmColor}
                    variant="contained"
                    autoFocus
                >
                    {confirmText}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
