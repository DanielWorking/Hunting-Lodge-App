import {
    Box,
    Typography,
    CircularProgress,
    type SxProps,
    type Theme,
} from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { keyframes } from "@emotion/react";

const pulse = keyframes`
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
`;

// הגדרת ה-Props שהרכיב יכול לקבל
interface ThinkingLoaderProps {
    size?: number; // גודל (ברירת מחדל 80)
    sx?: SxProps<Theme>; // עיצוב נוסף (כמו מרג'ין)
    showText?: boolean; // האם להציג את הטקסט "Thinking..."?
}

export default function ThinkingLoader({
    size = 80,
    sx,
    showText = true,
}: ThinkingLoaderProps) {
    // חישוב יחסי לגודל האייקון והטקסט
    const iconSize = size / 2;
    const fontSize = Math.max(12, size / 4); // הטקסט לא יהיה קטן מ-12px

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: size > 100 ? "50vh" : "auto", // אם הוא גדול - תפוס חצי מסך, אם קטן - רק את המקום שלו
                gap: size > 40 ? 2 : 1,
                ...sx, // הוספת העיצוב החיצוני
            }}
        >
            <Box sx={{ position: "relative", display: "inline-flex" }}>
                {/* המעגל המסתובב */}
                <CircularProgress
                    size={size}
                    thickness={2}
                    sx={{ color: "primary.main" }}
                />

                {/* הרובוט באמצע */}
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
                        fontSize: fontSize, // גודל טקסט דינמי
                        animation: `${pulse} 1.5s infinite ease-in-out`,
                    }}
                >
                    Thinking...
                </Typography>
            )}
        </Box>
    );
}
