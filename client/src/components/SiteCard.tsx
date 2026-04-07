import { useState } from "react";
import {
    Card,
    CardMedia,
    CardContent,
    Typography,
    CardActions,
    IconButton,
    Box,
    Chip,
    CardActionArea,
    Tooltip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import InfoIcon from "@mui/icons-material/Info";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { SiteCard as SiteCardType } from "../types";

interface SiteCardProps {
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
}: SiteCardProps) {
    const { title, url, imageUrl, description, isFavorite, tag } = data;
    const [isFlipped, setIsFlipped] = useState(false);

    // פונקציה לבדיקת תקינות התמונה
    const isValidImage = (img?: string) => {
        return (
            img &&
            (img.startsWith("http") || img.startsWith("data:image")) &&
            img.length > 10
        );
    };

    const imageSrc = isValidImage(imageUrl)
        ? imageUrl
        : "/hunting-lodge-image.jpg";

    const handleFlip = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setIsFlipped(!isFlipped);
    };

    return (
        <Box
            sx={{
                perspective: "1000px",
                height: "300px", // גובה קבוע לכרטיס כדי שההיפוך יעבוד יפה
                width: "100%",
            }}
        >
            <Box
                sx={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    transition: "transform 0.6s",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
            >
                {/* === FRONT SIDE === */}
                <Card
                    sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <CardActionArea
                        component="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ flexGrow: 1 }}
                    >
                        <CardMedia
                            component="img"
                            height="160"
                            image={imageSrc}
                            alt={title}
                            sx={{ objectFit: "cover" }}
                        />
                        <CardContent>
                            <Typography
                                gutterBottom
                                variant="h6"
                                component="div"
                                sx={{
                                    fontWeight: "bold",
                                    lineHeight: 1.2,
                                    // הגבלה ל-2 שורות כותרת
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {title}
                            </Typography>
                        </CardContent>
                    </CardActionArea>

                    <CardActions
                        sx={{
                            justifyContent: "space-between",
                            px: 2,
                            pb: 1,
                            mt: "auto", // דוחף את האייקונים למטה
                        }}
                    >
                        <Tooltip title="Tag">
                            <Chip
                                label={tag || "General"}
                                size="small"
                                variant="outlined"
                                sx={{ fontSize: "0.75rem", height: 24 }}
                            />
                        </Tooltip>

                        <Box>
                            <Tooltip title="Show Description">
                                <IconButton
                                    onClick={handleFlip}
                                    color="info"
                                    size="small"
                                >
                                    <InfoIcon />
                                </IconButton>
                            </Tooltip>

                            <Tooltip
                                title={
                                    isFavorite
                                        ? "Remove from Favorites"
                                        : "Add to Favorites"
                                }
                            >
                                <IconButton
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleFavorite?.();
                                    }}
                                    color={isFavorite ? "error" : "default"}
                                    size="small"
                                >
                                    {isFavorite ? (
                                        <FavoriteIcon fontSize="small" />
                                    ) : (
                                        <FavoriteBorderIcon fontSize="small" />
                                    )}
                                </IconButton>
                            </Tooltip>

                            {onEdit && (
                                <IconButton
                                    onClick={onEdit}
                                    size="small"
                                    color="primary"
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            )}

                            {onDelete && (
                                <IconButton
                                    onClick={onDelete}
                                    size="small"
                                    color="error"
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            )}
                        </Box>
                    </CardActions>
                </Card>

                {/* === BACK SIDE === */}
                <Card
                    sx={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        display: "flex",
                        flexDirection: "column",
                        bgcolor: "action.hover", // רקע מעט שונה לצד האחורי
                    }}
                >
                    <Box p={1} display="flex" justifyContent="flex-end">
                        <IconButton onClick={handleFlip} size="small">
                            <ArrowBackIcon />
                        </IconButton>
                    </Box>

                    <CardContent sx={{ overflowY: "auto", flexGrow: 1, pt: 0 }}>
                        <Typography
                            variant="h6"
                            gutterBottom
                            sx={{ fontSize: "1rem", fontWeight: "bold" }}
                        >
                            About {title}
                        </Typography>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                                whiteSpace: "pre-wrap",
                                // כאן התיאור יופיע במלואו, ואם הוא ארוך מדי יהיה גלילה בתוך הכרטיס
                            }}
                        >
                            {description || "No description provided."}
                        </Typography>
                    </CardContent>
                </Card>
            </Box>
        </Box>
    );
}
