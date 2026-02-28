import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import type { PhoneRow, PhoneType } from "../../types";

interface PhonesTableProps {
    phones: PhoneRow[];
    onRowClick: (phone: PhoneRow) => void;
    onEditClick: (phone: PhoneRow) => void;
    onDeleteClick: (phone: PhoneRow) => void;
    onToggleFavorite: (phone: PhoneRow) => void;
}

export default function PhonesTable({
    phones,
    onRowClick,
    onEditClick,
    onDeleteClick,
    onToggleFavorite,
}: PhonesTableProps) {
    const theme = useTheme();

    // צבע רקע לכותרת הטבלה (לתיקון Sticky ב-Dark Mode)
    const headerBgColor =
        theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f5";

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

    // פונקציית עזר פנימית לפורמט (כרגע מחזירה את המספר כמו שהוא, לפי הקוד המקורי)
    const formatPhoneNumber = (number: string) => {
        return number;
    };

    return (
        <TableContainer
            component={Paper}
            sx={{ maxHeight: "65vh", overflowY: "auto" }}
        >
            <Table sx={{ minWidth: 650 }} stickyHeader>
                <TableHead>
                    <TableRow>
                        {[
                            "Number",
                            "Type",
                            "Description",
                            "Name",
                            "Favorite",
                            "Actions",
                        ].map((header) => (
                            <TableCell
                                key={header}
                                align={
                                    header === "Favorite" ||
                                    header === "Actions"
                                        ? "center"
                                        : "left"
                                }
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                {header}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {phones.map((row) => (
                        <TableRow
                            key={row._id || row.id}
                            onClick={() => onRowClick(row)}
                            sx={{
                                cursor: "pointer",
                                "&:hover": { bgcolor: "action.hover" },
                                textDecoration: "none",
                            }}
                        >
                            <TableCell
                                component="th"
                                scope="row"
                                sx={{
                                    fontFamily: "monospace",
                                    fontSize: "1.1rem",
                                }}
                            >
                                {row.numbers && row.numbers.length > 0
                                    ? formatPhoneNumber(row.numbers[0])
                                    : ""}
                                {row.numbers && row.numbers.length > 1 && (
                                    <Typography
                                        component="span"
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ ml: 1, fontWeight: "bold" }}
                                    >
                                        (+{row.numbers.length - 1})
                                    </Typography>
                                )}
                            </TableCell>

                            <TableCell>
                                <Chip
                                    label={row.type}
                                    color={getTypeColor(row.type) as any}
                                    size="small"
                                    variant="outlined"
                                />
                            </TableCell>

                            <TableCell sx={{ maxWidth: 250 }}>
                                {row.description.length > 15
                                    ? `${row.description.slice(0, 15)}...`
                                    : row.description}
                            </TableCell>

                            <TableCell sx={{ fontWeight: "bold" }}>
                                {row.name}
                            </TableCell>

                            <TableCell align="center">
                                <IconButton
                                    color="error"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleFavorite(row);
                                    }}
                                >
                                    {row.isFavorite ? (
                                        <FavoriteIcon />
                                    ) : (
                                        <FavoriteBorderIcon />
                                    )}
                                </IconButton>
                            </TableCell>

                            <TableCell align="center">
                                <Tooltip title="Edit">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditClick(row);
                                        }}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteClick(row);
                                        }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                    {phones.length === 0 && (
                        <TableRow>
                            <TableCell
                                colSpan={6}
                                align="center"
                                sx={{ py: 3 }}
                            >
                                No phones found.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
