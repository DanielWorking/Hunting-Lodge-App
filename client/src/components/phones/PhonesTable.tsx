/**
 * @module PhonesTable
 *
 * Renders a data table for browsing and managing phone directory entries.
 * Features include type-based color coding, favorite toggling, and quick actions
 * for editing and deletion.
 */

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

/**
 * Props for the {@link PhonesTable} component.
 */
interface PhonesTableProps {
    /** The list of phone directory entries to display. */
    phones: PhoneRow[];
    /** Callback triggered when a row is clicked for detailed view. */
    onRowClick: (phone: PhoneRow) => void;
    /** Callback triggered when the edit action is invoked. */
    onEditClick: (phone: PhoneRow) => void;
    /** Callback triggered when the delete action is invoked. */
    onDeleteClick: (phone: PhoneRow) => void;
    /** Callback triggered when the favorite status is toggled. */
    onToggleFavorite: (phone: PhoneRow) => void;
}

/**
 * Renders an interactive table displaying phone contact information.
 *
 * Supports sticky headers, responsive layouts, and visual indicators for 
 * primary numbers and total associated numbers for each entry.
 *
 * @param {PhonesTableProps} props  The properties for the component.
 * @returns {JSX.Element}            The rendered table component.
 */
export default function PhonesTable({
    phones,
    onRowClick,
    onEditClick,
    onDeleteClick,
    onToggleFavorite,
}: PhonesTableProps) {
    const theme = useTheme();

    /** 
     * Determines the header background color.
     * Essential for ensuring sticky header text remains readable over scrolling content,
     * particularly in Dark Mode where default transparency can cause visual overlap.
     */
    const headerBgColor =
        theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f5";

    /**
     * Maps a phone type classification to a Material-UI color theme.
     * 
     * @param {PhoneType} type  The type of the phone entry.
     * @returns {string}        The corresponding Material-UI color key.
     */
    const getTypeColor = (type: PhoneType) => {
        switch (type) {
            case "Red":
                return "error";
            case "Black":
                return "default";
            case "Mobile":
                return "primary";
            case "Landline":
                return "info";
            default:
                return "default";
        }
    };

    /**
     * Placeholder for future complex number formatting.
     * Currently returns the number as-is.
     * 
     * @param {string} number  The raw phone number string.
     * @returns {string}       The formatted phone number.
     */
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

                            <TableCell
                                sx={{ fontWeight: "bold", maxWidth: 250 }}
                            >
                                {row.name.length > 15
                                    ? `${row.name.slice(0, 15)}...`
                                    : row.name}
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
