/**
 * @module WhatsNewModal
 *
 * A centered, compact blocking modal dialog presenting application updates one at a time.
 * Users navigate through updates using Back / Next controls or progress indicators.
 *
 * The modal suppresses escape key and backdrop dismissals, requiring the user to explicitly
 * acknowledge the updates on completion.
 */

import React, { useState, useEffect } from "react";
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
    CircularProgress,
    Alert,
    useTheme,
    alpha,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import AssessmentIcon from "@mui/icons-material/Assessment";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import ContactPhoneIcon from "@mui/icons-material/ContactPhone";
import { acknowledgeWhatsNew } from "../../api/usersApi";
import { envConfig } from "../../config/env";

/**
 * Props for the {@link WhatsNewModal} component.
 */
export interface WhatsNewModalProps {
    /** Whether the modal dialog is currently visible. */
    open: boolean;
    /** Callback fired when the user successfully acknowledges the updates. */
    onClose: () => void;
    /** Optional specific user ID to acknowledge for; defaults to authenticated token session. */
    userId?: string;
    /** Optional application version override to display. */
    version?: string;
}

interface FeatureSlide {
    icon: React.ReactNode;
    title: string;
    tag: string;
    description: string;
    accentColor: string;
    benefit: string;
}

const FEATURE_SLIDES: FeatureSlide[] = [
    {
        icon: <CalendarMonthIcon sx={{ fontSize: 44 }} />,
        title: "Shift Scheduling & Calendar",
        tag: "Schedule",
        description:
            "Interactive monthly calendar and weekly rosters with real-time slot constraints, seamless shift coverage, and clear shift assignments.",
        benefit: "Instant visibility on upcoming rosters and team coverage",
        accentColor: "#1976d2", // Blue
    },
    {
        icon: <AssessmentIcon sx={{ fontSize: 44 }} />,
        title: "Operational Shift Reports",
        tag: "Reports",
        description:
            "Log handover notes, track critical incidents, and generate comprehensive shift summaries to keep your operational shifts aligned.",
        benefit: "Zero handover gaps with structured digital shift logs",
        accentColor: "#0288d1", // Cyan / Sky Blue
    },
    {
        icon: <BeachAccessIcon sx={{ fontSize: 44 }} />,
        title: "Vacation Management & Quotas",
        tag: "Vacation",
        description:
            "Submit leave requests, track remaining vacation balances in real time, and review shift manager approvals directly inside the app.",
        benefit: "Self-service vacation balance tracking and quick approvals",
        accentColor: "#ed6c02", // Amber / Orange
    },
    {
        icon: <ContactPhoneIcon sx={{ fontSize: 44 }} />,
        title: "Phone & Site Directory",
        tag: "Directory",
        description:
            "Fast lookups for operational sites, quick emergency dialing lines, and customized personal favorite contacts always at your fingertips.",
        benefit: "One-click access to critical emergency and site contacts",
        accentColor: "#2e7d32", // Green
    },
];

/**
 * Centered, compact slide-by-slide "What's New" modal dialog.
 */
export default function WhatsNewModal({ open, onClose, userId, version }: WhatsNewModalProps) {
    const theme = useTheme();
    const clientVersion = version || import.meta.env.VITE_APP_VERSION || envConfig.appVersion || "1.0.0";
    const [activeStep, setActiveStep] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Reset step to 0 and clear errors whenever modal opens
    useEffect(() => {
        if (open) {
            setActiveStep(0);
            setErrorMessage(null);
        }
    }, [open]);

    const totalSteps = FEATURE_SLIDES.length;
    const isFirstStep = activeStep === 0;
    const isLastStep = activeStep === totalSteps - 1;
    const currentSlide = FEATURE_SLIDES[activeStep];

    const handleNext = () => {
        if (!isLastStep) {
            setActiveStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        if (!isFirstStep) {
            setActiveStep((prev) => prev - 1);
        }
    };

    const handleAcknowledge = async () => {
        setSubmitting(true);
        setErrorMessage(null);
        try {
            await acknowledgeWhatsNew(userId);
            onClose();
        } catch (error: unknown) {
            console.error("Failed to acknowledge What's New:", error);
            setErrorMessage(
                "Unable to save your acknowledgement at this time. Please check your connection and try again."
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            // Strict backdrop blocking: prevent Escape key and backdrop clicks from dismissing
            disableEscapeKeyDown
            onClose={(_event, reason) => {
                if (reason !== "backdropClick" && reason !== "escapeKeyDown") {
                    handleAcknowledge();
                }
            }}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                elevation: 24,
                sx: {
                    borderRadius: 3.5,
                    overflow: "hidden",
                    border: `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                    boxShadow: `0 20px 48px ${alpha(theme.palette.common.black, 0.28)}`,
                },
            }}
        >
            {/* Top Bar with Step Counter, Tag & App Version */}
            <Box
                sx={{
                    px: 3,
                    pt: 2.5,
                    pb: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip
                        label={currentSlide.tag}
                        size="small"
                        sx={{
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            bgcolor: alpha(currentSlide.accentColor, 0.12),
                            color: currentSlide.accentColor,
                            borderRadius: 1.5,
                        }}
                    />
                    <Chip
                        label={`v${clientVersion}`}
                        size="small"
                        variant="outlined"
                        sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            borderColor: alpha(theme.palette.divider, 0.9),
                            color: "text.secondary",
                            bgcolor: alpha(theme.palette.action.hover, 0.04),
                            borderRadius: 1.5,
                        }}
                    />
                </Box>
                <Typography
                    variant="caption"
                    sx={{
                        fontWeight: 600,
                        color: "text.secondary",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                    }}
                >
                    {activeStep + 1} of {totalSteps}
                </Typography>
            </Box>

            {/* Error Notification (if API call fails) */}
            {errorMessage && (
                <Box sx={{ px: 3, pt: 1 }}>
                    <Alert severity="error" sx={{ borderRadius: 2 }} onClose={() => setErrorMessage(null)}>
                        {errorMessage}
                    </Alert>
                </Box>
            )}

            {/* Slide Body: Single update per view, comfortably centered with no scrolling */}
            <DialogContent
                sx={{
                    px: 3,
                    py: 2,
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minHeight: 260,
                    justifyContent: "center",
                }}
            >
                {/* Feature Icon Badge */}
                <Box
                    sx={{
                        width: 76,
                        height: 76,
                        borderRadius: "50%",
                        bgcolor: alpha(currentSlide.accentColor, 0.1),
                        color: currentSlide.accentColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mb: 2,
                        boxShadow: `0 8px 20px ${alpha(currentSlide.accentColor, 0.2)}`,
                        transition: "all 0.3s ease-in-out",
                    }}
                >
                    {currentSlide.icon}
                </Box>

                {/* Feature Title */}
                <DialogTitle
                    sx={{
                        p: 0,
                        mb: 1.25,
                        fontWeight: 700,
                        fontSize: "1.25rem",
                        lineHeight: 1.3,
                        color: "text.primary",
                    }}
                >
                    {currentSlide.title}
                </DialogTitle>

                {/* Feature Description */}
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                        lineHeight: 1.55,
                        fontSize: "0.875rem",
                        mb: 2,
                        maxWidth: 340,
                    }}
                >
                    {currentSlide.description}
                </Typography>

                {/* Key Benefit Highlight Pill */}
                <Box
                    sx={{
                        px: 1.75,
                        py: 0.75,
                        borderRadius: 2,
                        bgcolor: alpha(currentSlide.accentColor, 0.08),
                        border: `1px solid ${alpha(currentSlide.accentColor, 0.18)}`,
                        maxWidth: 340,
                    }}
                >
                    <Typography
                        variant="caption"
                        sx={{
                            fontWeight: 600,
                            color: currentSlide.accentColor,
                            display: "block",
                            lineHeight: 1.35,
                        }}
                    >
                        ✨ {currentSlide.benefit}
                    </Typography>
                </Box>
            </DialogContent>

            {/* Stepper Dots Indicator */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 1,
                    py: 1,
                }}
            >
                {FEATURE_SLIDES.map((slide, idx) => (
                    <Box
                        key={idx}
                        onClick={() => setActiveStep(idx)}
                        sx={{
                            width: activeStep === idx ? 24 : 8,
                            height: 8,
                            borderRadius: 4,
                            bgcolor:
                                activeStep === idx
                                    ? slide.accentColor
                                    : alpha(theme.palette.text.secondary, 0.2),
                            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                            cursor: "pointer",
                            "&:hover": {
                                bgcolor: alpha(slide.accentColor, 0.6),
                            },
                        }}
                    />
                ))}
            </Box>

            <Divider />

            {/* Stepper Action Buttons: Back / Next / Finish */}
            <DialogActions
                sx={{
                    px: 3,
                    py: 2,
                    bgcolor: alpha(theme.palette.action.hover, 0.02),
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1.5,
                }}
            >
                {/* Back button */}
                <Button
                    variant="outlined"
                    color="inherit"
                    size="medium"
                    onClick={handleBack}
                    disabled={isFirstStep || submitting}
                    startIcon={<ArrowBackIcon />}
                    sx={{
                        borderRadius: 2,
                        textTransform: "none",
                        fontWeight: 600,
                        visibility: isFirstStep ? "hidden" : "visible",
                    }}
                >
                    Back
                </Button>

                {/* Next or Finish Button */}
                {isLastStep ? (
                    <Button
                        variant="contained"
                        color="primary"
                        size="medium"
                        disabled={submitting}
                        onClick={handleAcknowledge}
                        startIcon={
                            submitting ? (
                                <CircularProgress size={18} color="inherit" />
                            ) : (
                                <CheckCircleOutlineIcon />
                            )
                        }
                        sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 600,
                            px: 2.5,
                            boxShadow: theme.shadows[4],
                        }}
                    >
                        {submitting ? "Saving..." : "Got it, let's explore!"}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color="primary"
                        size="medium"
                        onClick={handleNext}
                        endIcon={<ArrowForwardIcon />}
                        sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: 600,
                            px: 2.5,
                            boxShadow: theme.shadows[3],
                        }}
                    >
                        Next
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
