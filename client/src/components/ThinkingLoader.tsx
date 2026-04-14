/**
 * @module ThinkingLoader
 *
 * A specialized loading indicator featuring a pulsing robot icon within a circular progress ring.
 * Used to signal background processing or AI-related "thinking" states.
 */

import {
    Box,
    Typography,
    CircularProgress,
    type SxProps,
    type Theme,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { keyframes } from "@emotion/react";

/**
 * Pulse animation for the central icon and optional label.
 */
const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
`;

/**
 * Configuration properties for the {@link ThinkingLoader} component.
 */
interface ThinkingLoaderProps {
    /** 
     * The overall diameter of the loader in pixels.
     * @default 80
     */
    size?: number;
    /** Optional Material-UI system props for custom styling and layout. */
    sx?: SxProps<Theme>;
    /** 
     * Whether to display the "Thinking..." text label below the loader.
     * @default true
     */
    showText?: boolean;
}

/**
 * Renders an animated loading state with a central robot icon and a circular progress ring.
 *
 * The component scales its internal icons and font sizes relative to the provided `size` prop
 * and supports responsive height adjustments for large instances.
 *
 * @param {ThinkingLoaderProps} props  The properties for the component.
 * @returns {JSX.Element}               The rendered loader component.
 */
export default function ThinkingLoader({
    size = 80,
    sx,
    showText = true,
}: ThinkingLoaderProps) {
    // Calculate proportional sizing for internal elements
    const iconSize = size / 2;
    const fontSize = Math.max(12, size / 4); // Minimum readable font size of 12px

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                // Occupation logic: large loaders occupy half the screen, small ones fit content
                height: size > 100 ? "50vh" : "auto",
                gap: size > 40 ? 2 : 1,
                ...sx,
            }}
        >
            <Box sx={{ position: "relative", display: "inline-flex" }}>
                {/* Rotating progress ring */}
                <CircularProgress
                    size={size}
                    thickness={2}
                    sx={{ color: "primary.main" }}
                />

                {/* Centered pulsing robot icon */}
                <Box
                    sx={{
                        top: 0,
                        left: 0,
                        bottom: 0,
                        right: 0,
                        position: "absolute",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <SmartToyIcon
                        sx={{
                            fontSize: iconSize,
                            color: "primary.main",
                            animation: `${pulse} 1.5s infinite ease-in-out`,
                        }}
                    />
                </Box>
            </Box>

            {showText && (
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: "bold",
                        color: "text.secondary",
                        letterSpacing: 1,
                        fontSize: fontSize, // Dynamic scaling based on component size
                        animation: `${pulse} 1.5s infinite ease-in-out`,
                    }}
                >
                    Thinking...
                </Typography>
            )}
        </Box>
    );
}
