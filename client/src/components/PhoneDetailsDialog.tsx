/**
 * @module PhoneDetailsDialog
 *
 * Provides a detailed read-only view of a specific phone record.
 * Displays the phone's name, type, all associated numbers, and its description.
 */

import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Chip,
    Divider,
} from "@mui/material";
import type { PhoneRow, PhoneType } from "../types";

/**
 * Props for the {@link PhoneDetailsDialog} component.
 */
interface Props {
    /** Whether the dialog is currently visible. */
    open: boolean;
    /** Callback function to close the dialog. */
    onClose: () => void;
    /** The phone data to display, or null if no phone is selected. */
    data: PhoneRow | null;
}

/**
 * Renders a modal dialog displaying exhaustive details for a phone entry.
 *
 * This component is used for inspecting individual records without entering edit mode.
 * It features formatted phone numbers and a scrollable description area.
 *
 * @param {Props} props  The properties for the component.
 * @returns {JSX.Element | null} The rendered dialog or null if no data is provided.
 */
export default function PhoneDetailsDialog({ open, onClose, data }: Props) {
    if (!data) return null;

    /**
     * Maps a phone type to a Material-UI color theme for consistent UI signaling.
     *
     * @param {PhoneType} type  The type classification of the phone.
     * @returns {string}        The corresponding Material-UI color key.
     */
    const getTypeColor = (type: PhoneType) => {
        switch (type) {
            case "Red":
                return "error";
            case "Black":
                return "default";
            case "Mobile":
                return "primary";
            case "Landline":
                return "success";
            default:
                return "default";
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle
                sx={{
                    bgcolor: "background.default",
                    borderBottom: 1,
                    borderColor: "divider",
                }}
            >
                Phone Details
            </DialogTitle>

            <DialogContent sx={{ mt: 2 }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <Box>
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                Name
                            </Typography>
                            <Typography
                                variant="h6"
                                sx={{ wordBreak: "break-word" }}
                            >
                                {data.name}
                            </Typography>
                        </Box>
                        <Chip
                            label={data.type}
                            color={getTypeColor(data.type) as any}
                            size="medium"
                            variant="filled"
                        />
                    </Box>

                    <Divider />

                    <Box>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ mb: 1, display: "block" }}
                        >
                            Phone Numbers ({data.numbers.length})
                        </Typography>
                        {data.numbers.map((num) => (
                            <Typography
                                key={num}
                                variant="h5"
                                sx={{
                                    fontFamily: "monospace",
                                    letterSpacing: 1,
                                    borderLeft: "4px solid",
                                    borderColor: "primary.main",
                                    pl: 2,
                                    mb: 1,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {num}
                            </Typography>
                        ))}
                    </Box>

                    <Box
                        sx={{
                            bgcolor: "action.hover",
                            p: 2,
                            borderRadius: 1,
                            maxHeight: "250px",
                            overflowY: "auto",
                            border: 1,
                            borderColor: "divider",
                        }}
                    >
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mb: 1 }}
                        >
                            Description
                        </Typography>
                        <Typography
                            variant="body1"
                            sx={{
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}
                        >
                            {data.description}
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} variant="contained">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}
