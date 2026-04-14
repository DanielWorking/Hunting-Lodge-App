/**
 * @module PhonesHeader
 *
 * Provides the header section for the Phone Directory, including search,
 * filtering, and action controls.
 */

import {
    Box,
    Typography,
    TextField,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SortIcon from "@mui/icons-material/Sort";

/**
 * Properties for the {@link PhonesHeader} component.
 */
interface PhonesHeaderProps {
    /** The current favorite filter state ('all' or 'fav'). */
    filterFav: string;
    /** Callback to update the favorite filter state. */
    setFilterFav: (value: string) => void;
    /** The current search query string. */
    searchTerm: string;
    /** Callback to update the search term as the user types. */
    setSearchTerm: (value: string) => void;
    /** The current sort identifier (e.g., 'name-asc'). */
    sortOrder: string;
    /** Callback to toggle between ascending and descending sort orders. */
    onToggleSortOrder: () => void;
    /** Callback triggered when the 'Add Phone' action is initiated. */
    onAddClick: () => void;
}

/**
 * Renders the top navigation and action bar for the Phone Directory.
 *
 * Includes the page title, description, and a toolbar with filtering by
 * favorites, search by name/number, sorting, and adding new records.
 *
 * @param {PhonesHeaderProps} props  The properties for the component.
 * @returns {JSX.Element}             The rendered header component.
 */
export default function PhonesHeader({
    filterFav,
    setFilterFav,
    searchTerm,
    setSearchTerm,
    sortOrder,
    onToggleSortOrder,
    onAddClick,
}: PhonesHeaderProps) {
    return (
        <>
            <Box
                sx={{
                    mb: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Phone Directory
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Global contact list shared across all teams.
                </Typography>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mb: 4,
                    flexWrap: "wrap",
                    alignItems: "center",
                    bgcolor: "background.paper",
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 1,
                }}
            >
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Filter</InputLabel>
                    <Select
                        value={filterFav}
                        label="Filter"
                        onChange={(e) => setFilterFav(e.target.value)}
                    >
                        <MenuItem value="all">Show All</MenuItem>
                        <MenuItem value="fav">Favorites Only</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    size="small"
                    label="Search Phones..."
                    variant="outlined"
                    sx={{ flexGrow: 1 }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <Button
                    variant="outlined"
                    startIcon={<SortIcon />}
                    onClick={onToggleSortOrder}
                >
                    {sortOrder === "name-asc" ? "Name (A-Z)" : "Name (Z-A)"}
                </Button>

                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={onAddClick}
                >
                    Add Phone
                </Button>
            </Box>
        </>
    );
}
