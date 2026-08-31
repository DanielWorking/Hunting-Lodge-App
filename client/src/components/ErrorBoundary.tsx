/**
 * @module ErrorBoundary
 *
 * Provides a top-level React Error Boundary component that catches uncaught
 * runtime JavaScript errors anywhere in the child component tree, logs the errors,
 * and displays a user-friendly fallback view with recovery options (reload, home, try again)
 * rather than unmounting the entire application to a blank screen.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import {
    Box,
    Typography,
    Button,
    Paper,
    Container,
    Stack,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    IconButton,
    Tooltip,
} from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

/**
 * Props passed to a custom fallback render function.
 */
export interface FallbackProps {
    /** The caught JavaScript runtime error object. */
    error: Error | null;
    /** React-specific component stack trace information. */
    errorInfo: ErrorInfo | null;
    /** Callback function to reset the error boundary state and retry rendering. */
    resetErrorBoundary: () => void;
}

/**
 * Props accepted by the ErrorBoundary component.
 */
export interface ErrorBoundaryProps {
    /** The child React node tree wrapped by the error boundary. */
    children: ReactNode;
    /**
     * Optional custom fallback UI element or render function.
     * If omitted, a default branded error fallback view will be rendered.
     */
    fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
    /** Optional callback invoked when an error is caught. */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** Optional callback invoked when the error state is reset. */
    onReset?: () => void;
}

/**
 * Internal state for the ErrorBoundary component.
 */
interface ErrorBoundaryState {
    /** Indicates whether an uncaught error has occurred. */
    hasError: boolean;
    /** The caught error instance, or null if no error has occurred. */
    error: Error | null;
    /** Component stack trace information captured by React. */
    errorInfo: ErrorInfo | null;
    /** Whether the technical error details have been copied to the clipboard. */
    copied: boolean;
}

/**
 * Global React Error Boundary Class Component.
 *
 * Catches JavaScript errors during the rendering lifecycle of child components,
 * prevents the application from unmounting entirely, and displays recovery options.
 *
 * @class
 * @extends {Component<ErrorBoundaryProps, ErrorBoundaryState>}
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    /**
     * Creates an instance of ErrorBoundary.
     *
     * @param {ErrorBoundaryProps} props - The component props.
     */
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
        };
    }

    /**
     * Updates state so the next render will show the fallback UI.
     *
     * @param {Error} error - The caught runtime error.
     * @returns {Partial<ErrorBoundaryState>} The updated error state.
     */
    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return {
            hasError: true,
            error,
        };
    }

    /**
     * Logs error details and invokes the optional onError callback.
     *
     * @param {Error} error - The caught runtime error.
     * @param {ErrorInfo} errorInfo - React component stack information.
     */
    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error("Uncaught runtime error caught by ErrorBoundary:", error, errorInfo);
        this.setState({ errorInfo });
        this.props.onError?.(error, errorInfo);
    }

    /**
     * Resets the error state, allowing the child component tree to re-mount and render.
     */
    resetErrorBoundary = (): void => {
        this.props.onReset?.();
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
        });
    };

    /**
     * Triggers a full browser reload to restore the application state.
     */
    handleReload = (): void => {
        window.location.reload();
    };

    /**
     * Navigates the browser to the application root.
     */
    handleGoHome = (): void => {
        window.location.href = "/";
    };

    /**
     * Copies diagnostic error details to the user's clipboard.
     */
    handleCopyError = async (): Promise<void> => {
        const { error, errorInfo } = this.state;
        const details = [
            `Timestamp: ${new Date().toISOString()}`,
            `URL: ${window.location.href}`,
            `Error Name: ${error?.name || "Unknown"}`,
            `Error Message: ${error?.message || "No message provided"}`,
            error?.stack ? `\nStack Trace:\n${error.stack}` : "",
            errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : "",
        ]
            .filter(Boolean)
            .join("\n");

        try {
            await navigator.clipboard.writeText(details);
            this.setState({ copied: true });
            setTimeout(() => {
                this.setState({ copied: false });
            }, 2500);
        } catch (copyErr) {
            console.error("Failed to copy error details to clipboard:", copyErr);
        }
    };

    /**
     * Renders either the children or the error fallback UI.
     *
     * @returns {ReactNode} The rendered children or fallback interface.
     */
    render(): ReactNode {
        const { hasError, error, errorInfo, copied } = this.state;
        const { children, fallback } = this.props;

        if (hasError) {
            // Render custom fallback if provided
            if (typeof fallback === "function") {
                return fallback({
                    error,
                    errorInfo,
                    resetErrorBoundary: this.resetErrorBoundary,
                });
            }

            if (fallback) {
                return fallback;
            }

            // Default branded fallback view
            return (
                <Box
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    minHeight="100vh"
                    sx={{
                        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
                        color: "#F8FAFC",
                        p: 3,
                        fontFamily: '"Fira Sans", sans-serif',
                    }}
                >
                    <Container maxWidth="md">
                        <Paper
                            elevation={24}
                            sx={{
                                p: { xs: 3, sm: 5 },
                                textAlign: "center",
                                borderRadius: 4,
                                backgroundColor: "#1E293B",
                                border: "1px solid #334155",
                                color: "#F8FAFC",
                                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
                            }}
                        >
                            <Box display="flex" justifyContent="center" mb={2}>
                                <WarningAmberRoundedIcon
                                    sx={{
                                        fontSize: 72,
                                        color: "#F59E0B",
                                        filter: "drop-shadow(0px 4px 12px rgba(245, 158, 11, 0.4))",
                                    }}
                                />
                            </Box>

                            <Typography
                                variant="h4"
                                component="h1"
                                fontWeight="700"
                                sx={{
                                    fontFamily: '"Fira Code", monospace',
                                    letterSpacing: "-0.5px",
                                    mb: 1.5,
                                    color: "#F8FAFC",
                                }}
                            >
                                Application Encountered an Error
                            </Typography>

                            <Typography
                                variant="body1"
                                sx={{
                                    color: "#94A3B8",
                                    mb: 4,
                                    maxWidth: 600,
                                    mx: "auto",
                                    lineHeight: 1.6,
                                }}
                            >
                                An unexpected runtime error occurred during rendering. You can try refreshing the
                                application, returning to the home dashboard, or attempting to re-render the view.
                            </Typography>

                            <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={2}
                                justifyContent="center"
                                sx={{ mb: 4 }}
                            >
                                <Button
                                    variant="contained"
                                    size="large"
                                    startIcon={<RefreshRoundedIcon />}
                                    onClick={this.handleReload}
                                    sx={{
                                        backgroundColor: "#F59E0B",
                                        color: "#0F172A",
                                        fontWeight: 700,
                                        px: 3,
                                        py: 1.2,
                                        borderRadius: 2,
                                        fontFamily: '"Fira Code", monospace',
                                        textTransform: "none",
                                        "&:hover": {
                                            backgroundColor: "#D97706",
                                        },
                                    }}
                                >
                                    Reload Page
                                </Button>

                                <Button
                                    variant="outlined"
                                    size="large"
                                    startIcon={<HomeRoundedIcon />}
                                    onClick={this.handleGoHome}
                                    sx={{
                                        borderColor: "#60A5FA",
                                        color: "#60A5FA",
                                        fontWeight: 600,
                                        px: 3,
                                        py: 1.2,
                                        borderRadius: 2,
                                        fontFamily: '"Fira Code", monospace',
                                        textTransform: "none",
                                        borderWidth: "2px",
                                        "&:hover": {
                                            borderColor: "#93C5FD",
                                            backgroundColor: "rgba(96, 165, 250, 0.08)",
                                            borderWidth: "2px",
                                        },
                                    }}
                                >
                                    Return to Home
                                </Button>

                                <Button
                                    variant="text"
                                    size="large"
                                    startIcon={<ReplayRoundedIcon />}
                                    onClick={this.resetErrorBoundary}
                                    sx={{
                                        color: "#94A3B8",
                                        fontWeight: 600,
                                        px: 2,
                                        py: 1.2,
                                        borderRadius: 2,
                                        fontFamily: '"Fira Code", monospace',
                                        textTransform: "none",
                                        "&:hover": {
                                            color: "#F8FAFC",
                                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                                        },
                                    }}
                                >
                                    Try Again
                                </Button>
                            </Stack>

                            {/* Technical diagnostics accordion */}
                            <Accordion
                                disableGutters
                                sx={{
                                    backgroundColor: "#0F172A",
                                    border: "1px solid #334155",
                                    borderRadius: 2,
                                    textAlign: "left",
                                    "&:before": { display: "none" },
                                }}
                            >
                                <AccordionSummary
                                    expandIcon={<ExpandMoreRoundedIcon sx={{ color: "#94A3B8" }} />}
                                    sx={{
                                        px: 2.5,
                                        py: 1,
                                        "& .MuiAccordionSummary-content": {
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            pr: 1,
                                        },
                                    }}
                                >
                                    <Typography
                                        variant="subtitle2"
                                        component="p"
                                        sx={{
                                            fontFamily: '"Fira Code", monospace',
                                            fontWeight: 600,
                                            color: "#94A3B8",
                                        }}
                                    >
                                        Technical Details & Diagnostic Info
                                    </Typography>
                                    <Tooltip title={copied ? "Copied!" : "Copy Error Details"}>
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                this.handleCopyError();
                                            }}
                                            sx={{
                                                color: copied ? "#10B981" : "#94A3B8",
                                                "&:hover": { color: "#F8FAFC" },
                                            }}
                                        >
                                            {copied ? (
                                                <CheckRoundedIcon fontSize="small" />
                                            ) : (
                                                <ContentCopyRoundedIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                </AccordionSummary>
                                <AccordionDetails sx={{ px: 2.5, pb: 2.5, pt: 0 }}>
                                    {error && (
                                        <Box sx={{ mb: 2 }}>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    display: "block",
                                                    color: "#EF4444",
                                                    fontWeight: 700,
                                                    fontFamily: '"Fira Code", monospace',
                                                    mb: 0.5,
                                                }}
                                            >
                                                {error.name}: {error.message}
                                            </Typography>
                                        </Box>
                                    )}

                                    {error?.stack && (
                                        <Box
                                            component="pre"
                                            sx={{
                                                m: 0,
                                                p: 1.5,
                                                backgroundColor: "#020617",
                                                borderRadius: 1,
                                                overflowX: "auto",
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: "0.75rem",
                                                color: "#CBD5E1",
                                                maxHeight: "180px",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-word",
                                            }}
                                        >
                                            {error.stack}
                                        </Box>
                                    )}

                                    {errorInfo?.componentStack && (
                                        <Box
                                            component="pre"
                                            sx={{
                                                mt: 1.5,
                                                mb: 0,
                                                p: 1.5,
                                                backgroundColor: "#020617",
                                                borderRadius: 1,
                                                overflowX: "auto",
                                                fontFamily: '"Fira Code", monospace',
                                                fontSize: "0.75rem",
                                                color: "#94A3B8",
                                                maxHeight: "140px",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-word",
                                            }}
                                        >
                                            Component Stack:
                                            {errorInfo.componentStack}
                                        </Box>
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        </Paper>
                    </Container>
                </Box>
            );
        }

        return children;
    }
}

export default ErrorBoundary;
