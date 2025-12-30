import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    DialogContentText,
} from "@mui/material";

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    content: string;
    onConfirm: () => void;
    onCancel: () => void;
    // תוספות לגמישות:
    confirmText?: string;
    confirmColor?: "error" | "primary" | "success" | "info";
}

export default function ConfirmDialog({
    open,
    title,
    content,
    onConfirm,
    onCancel,
    confirmText = "Confirm Delete", // ברירת מחדל למקרה שלא שלחנו כלום
    confirmColor = "error", // ברירת מחדל אדומה
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
                {/* שימוש בטקסט ובצבע הדינמיים */}
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
