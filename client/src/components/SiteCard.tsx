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

    // פונקציה לבדיקת תקינות התמונה
    const isValidImage = (img: string) => {
        return (
            img &&
            (img.startsWith("http") || img.startsWith("data:image")) &&
            img.length > 10
        );
    };

    const imageSrc = isValidImage(imageUrl)
        ? imageUrl
        : "/hunting-lodge-image.jpg";

    return (
        <Card
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 4,
                },
            }}
        >
            {/* 1. לחיצה על כל האזור הזה פותחת את הקישור */}
            <CardActionArea
                component="a"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                }}
            >
                <CardMedia
                    component="img"
                    height="140"
                    image={imageSrc}
                    alt={title}
                    sx={{ objectFit: "cover" }}
                />

                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                    <Typography
                        gutterBottom
                        variant="h6"
                        component="div"
                        sx={{ fontWeight: "bold", lineHeight: 1.2 }}
                    >
                        {title}
                    </Typography>

                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                            mb: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: "vertical",
                        }}
                    >
                        {description}
                    </Typography>
                </CardContent>
            </CardActionArea>

            {/* 2. חלק תחתון: תגית משמאל, אייקונים מימין */}
            <CardActions
                sx={{
                    justifyContent: "space-between",
                    px: 2,
                    pb: 1,
                    pt: 0,
                    borderTop: "1px solid rgba(0,0,0,0.05)",
                }}
            >
                {/* הצגת התגית */}
                <Tooltip title="Tag">
                    <Chip
                        label={tag || "General"}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.75rem", height: 24 }}
                    />
                </Tooltip>

                {/* האייקונים */}
                <Box>
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
                        <Tooltip title="Edit">
                            <IconButton
                                onClick={onEdit}
                                size="small"
                                color="primary"
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}

                    {onDelete && (
                        <Tooltip title="Delete">
                            <IconButton
                                onClick={onDelete}
                                size="small"
                                color="error"
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </CardActions>
        </Card>
    );
}
