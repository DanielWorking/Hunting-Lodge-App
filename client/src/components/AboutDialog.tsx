import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Divider,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import CodeIcon from "@mui/icons-material/Code";

interface AboutDialogProps {
    open: boolean;
    onClose: () => void;
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    bgcolor: "background.default",
                }}
            >
                <InfoIcon color="primary" />
                About & Support
            </DialogTitle>

            <DialogContent sx={{ mt: 2 }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {/* Credits Section */}
                    <Box>
                        <Typography
                            variant="subtitle2"
                            color="text.secondary"
                            gutterBottom
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                            }}
                        >
                            <CodeIcon fontSize="small" /> Developed by
                        </Typography>
                        <Typography variant="h6" fontWeight="bold">
                            Daniel Reifer
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            System Creator & Developer
                        </Typography>
                    </Box>

                    <Divider />

                    {/* Support Section */}
                    <Box>
                        <Typography
                            variant="subtitle2"
                            color="text.secondary"
                            gutterBottom
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                            }}
                        >
                            <SupportAgentIcon fontSize="small" /> Support &
                            Feedback
                        </Typography>
                        <Typography
                            variant="body2"
                            component="p"
                            sx={{ direction: "rtl" }}
                        >
                            נתקלתם בבעיה? יש לכם רעיון לשיפור?
                            <br />
                            מוזמנים לפנות לצוות <b>NOC Tacti</b>.
                        </Typography>
                        <br />

                        <Box
                            sx={{
                                bgcolor: "primary.main",
                                color: "primary.contrastText",
                                p: 2,
                                borderRadius: 2,
                                textAlign: "center",
                                boxShadow: 2,
                            }}
                        >
                            <Typography
                                variant="h5"
                                sx={{
                                    fontFamily: "monospace",
                                    letterSpacing: 2,
                                    fontWeight: "bold",
                                }}
                            >
                                0305-4851
                            </Typography>
                        </Box>
                    </Box>
                </Box>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} variant="outlined">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}
