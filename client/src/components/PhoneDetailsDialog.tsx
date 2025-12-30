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

interface Props {
    open: boolean;
    onClose: () => void;
    data: PhoneRow | null;
}

export default function PhoneDetailsDialog({ open, onClose, data }: Props) {
    if (!data) return null;

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
                        {data.numbers.map((num, idx) => (
                            <Typography
                                key={idx}
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
