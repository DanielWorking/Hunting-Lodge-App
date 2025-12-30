import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    List,
    ListItem,
    ListItemText,
    ListSubheader,
} from "@mui/material";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

interface ShiftDatesDialogProps {
    open: boolean;
    onClose: () => void;
    shiftName: string;
    dates: string[];
}

export default function ShiftDatesDialog({
    open,
    onClose,
    shiftName,
    dates,
}: ShiftDatesDialogProps) {
    const safeDates = Array.isArray(dates) ? dates : [];

    const sortedDates = [...safeDates]
        .map((d) => new Date(d))
        .filter((d) => !isNaN(d.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

    const groupedDates: { [key: string]: Date[] } = {};

    sortedDates.forEach((date) => {
        try {
            const monthKey = date.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
            });

            if (!groupedDates[monthKey]) {
                groupedDates[monthKey] = [];
            }
            groupedDates[monthKey].push(date);
        } catch (e) {
            console.error("Error formatting date in dialog", e);
        }
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            {/* === תיקון: הסרת כפתור ה-X === */}
            <DialogTitle
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    py: 1.5,
                }}
            >
                <CalendarTodayIcon />
                <Typography variant="h6">{shiftName}</Typography>
            </DialogTitle>

            <DialogContent sx={{ p: 0 }}>
                {/* סיכום כמות */}
                <Box
                    sx={{
                        p: 2,
                        bgcolor: "action.hover",
                        borderBottom: 1,
                        borderColor: "divider",
                        textAlign: "center",
                    }}
                >
                    <Typography variant="subtitle1" fontWeight="bold">
                        Total Days: {sortedDates.length}
                    </Typography>
                </Box>

                {/* רשימת התאריכים */}
                <List
                    sx={{
                        width: "100%",
                        bgcolor: "background.paper",
                        maxHeight: 400,
                        overflow: "auto",
                    }}
                >
                    {Object.keys(groupedDates).length === 0 && (
                        <Typography
                            sx={{
                                p: 2,
                                textAlign: "center",
                                color: "text.secondary",
                            }}
                        >
                            No valid dates found.
                        </Typography>
                    )}

                    {Object.keys(groupedDates).map((month) => (
                        <li key={month}>
                            <ul style={{ padding: 0, listStyle: "none" }}>
                                <ListSubheader
                                    sx={{
                                        bgcolor: "background.default",
                                        fontWeight: "bold",
                                        lineHeight: "30px",
                                    }}
                                >
                                    {month}
                                </ListSubheader>
                                {groupedDates[month].map((date) => (
                                    <ListItem
                                        key={date.toISOString()}
                                        dense
                                        divider
                                    >
                                        <ListItemText
                                            primary={date.toLocaleDateString(
                                                "he-IL"
                                            )}
                                            secondary={date.toLocaleDateString(
                                                "en-US",
                                                { weekday: "long" }
                                            )}
                                            sx={{ pl: 2 }}
                                        />
                                    </ListItem>
                                ))}
                            </ul>
                        </li>
                    ))}
                </List>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} color="primary" variant="contained">
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}
