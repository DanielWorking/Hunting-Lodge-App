import { useState } from "react";
import {
    Card,
    CardContent,
    CardMedia,
    Typography,
    IconButton,
    Box,
    Tooltip,
    useTheme,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoIcon from "@mui/icons-material/Info";
import CloseIcon from "@mui/icons-material/Close";
import type { SiteCard as SiteCardType } from "../types";

interface Props {
    data: SiteCardType;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
}

export default function SiteCard({
    data,
    onEdit,
    onDelete,
    onToggleFavorite,
}: Props) {
    const theme = useTheme(); // שימוש ב-Theme כדי לקבל צבעים נכונים
    const [isFlipped, setIsFlipped] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const handleFlip = () => {
        setIsFlipped(!isFlipped);
    };

    // פתיחת הקישור בלחיצה על הכרטיס
    const handleCardClick = () => {
        if (!isFlipped && data.url) {
            window.open(data.url, "_blank");
        }
    };

    const formatDate = (dateString: string) => {
        try {
            return new Date(dateString).toLocaleDateString("he-IL");
        } catch (e) {
            return dateString;
        }
    };

    return (
        <Box
            sx={{
                perspective: "1000px",
                width: "100%",
                height: 300,
                cursor: "pointer",
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <Box
                sx={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    textAlign: "center",
                    transition: "transform 0.6s",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                    boxShadow: isHovered ? 6 : 1,
                    borderRadius: 2,
                }}
            >
                {/* === FRONT === */}
                <Card
                    onClick={handleCardClick} // הוספנו את הלחיצה לפתיחת הקישור
                    sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <CardMedia
                        component="img"
                        height="160"
                        image={data.imageUrl}
                        alt={data.title}
                        sx={{ objectFit: "cover" }}
                    />

                    <CardContent sx={{ flexGrow: 1, p: 1 }}>
                        <Typography
                            variant="h6"
                            component="div"
                            sx={{ fontWeight: "bold" }}
                        >
                            {data.title}
                        </Typography>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                        >
                            {data.url}
                        </Typography>
                    </CardContent>

                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "space-around",
                            p: 1,
                            borderTop: `1px solid ${theme.palette.divider}`,
                        }}
                    >
                        <Tooltip title="Toggle Favorite">
                            <IconButton
                                color={data.isFavorite ? "error" : "default"}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleFavorite?.();
                                }}
                            >
                                {data.isFavorite ? (
                                    <FavoriteIcon />
                                ) : (
                                    <FavoriteBorderIcon />
                                )}
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Edit">
                            <IconButton
                                color="primary"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit?.();
                                }}
                            >
                                <EditIcon />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Delete">
                            <IconButton
                                color="default"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete?.();
                                }}
                            >
                                <DeleteIcon />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title="Show Info">
                            <IconButton
                                color="info"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleFlip();
                                }}
                            >
                                <InfoIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Card>

                {/* === BACK === */}
                <Card
                    sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        display: "flex",
                        flexDirection: "column",
                        // תיקון צבע הרקע של הצד האחורי
                        bgcolor:
                            theme.palette.mode === "dark"
                                ? "background.default"
                                : "#f5f5f5",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            justifyContent: "flex-end",
                            p: 1,
                        }}
                    >
                        <IconButton size="small" onClick={handleFlip}>
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    <CardContent
                        sx={{
                            flexGrow: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    >
                        <Typography variant="h6" gutterBottom color="primary">
                            Description
                        </Typography>
                        <Typography variant="body1">
                            {data.description}
                        </Typography>

                        <Typography
                            variant="caption"
                            sx={{ mt: 2, color: "text.secondary" }}
                        >
                            Created: {formatDate(data.createdAt)}
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
}
