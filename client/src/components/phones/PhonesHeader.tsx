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

interface PhonesHeaderProps {
    filterFav: string;
    setFilterFav: (value: string) => void;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    sortOrder: string;
    onToggleSortOrder: () => void;
    onAddClick: () => void;
}

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
            <Box sx={{ mb: 4 }}>
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
