/**
 * @module AboutDialog
 *
 * Displays information about the application, including developer attribution,
 * support contact details for the NOC Tacti team, and the application version.
 */

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
import { envConfig } from "../config/env";

/**
 * Props for the {@link AboutDialog} component.
 */
interface AboutDialogProps {
    /** Whether the dialog is currently visible to the user. */
    open: boolean;
    /** Callback function triggered when the dialog is requested to close. */
    onClose: () => void;
}

/**
 * Renders a lightweight modal dialog with developer credits, support contact information,
 * and the build version pin. Utilizes pure backdrop clicks for dismissal without extra action buttons.
 *
 * @param {AboutDialogProps} props The properties for the component.
 * @returns {JSX.Element} The rendered dialog component.
 */
export default function AboutDialog({ open, onClose }: AboutDialogProps) {
    const clientVersion =
        import.meta.env.VITE_APP_VERSION || envConfig.appVersion || "1.0.0";

    const handleDialogClose = (
        _event: object,
        reason?: "backdropClick" | "escapeKeyDown",
    ) => {
        if (!reason || reason === "backdropClick" || reason === "escapeKeyDown") {
            onClose();
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleDialogClose}
            maxWidth="xs"
            fullWidth
        >
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

            <DialogContent sx={{ mt: 2, pb: 2.5 }}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {/* Credits Section */}
                    <Box>
                        <Typography
                            variant="subtitle2"
                            component="p"
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
                        <Typography variant="h6" component="p" fontWeight="bold">
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
                            component="p"
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
                                component="p"
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

                    {/* Dynamic Version Pin */}
                    <Typography
                        variant="caption"
                        component="p"
                        align="center"
                        color="text.secondary"
                        sx={{ mt: 1, fontWeight: 500, letterSpacing: 0.5 }}
                    >
                        {`v${clientVersion}`}
                    </Typography>
                </Box>
            </DialogContent>

            <DialogActions sx={{ pb: 2, px: 3 }}>
                <Button onClick={onClose} variant="outlined">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}
