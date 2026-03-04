import React, { forwardRef } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Box,
} from "@mui/material";
import { format, isSameDay } from "date-fns";
import { he } from "date-fns/locale";
import type { ShiftType } from "../types";

// הגדרת הטיפוסים שהטבלה צריכה לקבל
interface LocalShift {
    userId: string;
    date: Date;
    shiftTypeId: string;
    vacationDeducted?: boolean;
}

interface ScheduleTableProps {
    isFull: boolean;
    weekDays: Date[];
    activeUsers: any[]; // או הגדרת טיפוס User מדויק אם קיים
    shifts: LocalShift[];
    shiftTypes: ShiftType[];
    isShiftManager: boolean;
    isAdmin: boolean;
    selectedCell: { userId: string; date: Date } | null;
    onCellClick: (
        event: React.MouseEvent<HTMLTableDataCellElement>,
        userId: string,
        date: Date,
    ) => void;
}

// פונקציות עזר שהיו בתוך הקומפוננטה הראשית
const getContrastText = (hexColor: string) => {
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "black" : "white";
};

// שימוש ב-forwardRef כדי לאפשר העברת ref מהאבא (נחוץ למסך מלא)
const ScheduleTable = forwardRef<HTMLDivElement, ScheduleTableProps>(
    (
        {
            isFull,
            weekDays,
            activeUsers,
            shifts,
            shiftTypes,
            isShiftManager,
            isAdmin,
            selectedCell,
            onCellClick,
        },
        ref,
    ) => {
        // לוגיקה פנימית למציאת משמרת
        const getShiftForCell = (userId: string, date: Date) => {
            return shifts.find(
                (s) => s.userId === userId && isSameDay(s.date, date),
            );
        };

        const getShiftType = (id: string) => {
            return shiftTypes.find((t) => t._id === id);
        };

        return (
            <TableContainer
                component={Paper}
                sx={{
                    maxHeight: isFull ? "none" : "70vh",
                    overflow: isFull ? "visible" : "auto",
                }}
                ref={ref} // ה-Ref מתחבר כאן
            >
                <Table stickyHeader={!isFull}>
                    <TableHead>
                        <TableRow>
                            <TableCell
                                sx={{
                                    bgcolor: "background.default",
                                    fontWeight: "bold",
                                    zIndex: 20,
                                    minWidth: 150,
                                }}
                            >
                                Employee
                            </TableCell>
                            {weekDays.map((day) => (
                                <TableCell
                                    key={day.toISOString()}
                                    align="center"
                                    sx={{
                                        bgcolor: "background.default",
                                        fontWeight: "bold",
                                        minWidth: 120,
                                    }}
                                >
                                    {format(day, "EEEE", { locale: he })} <br />
                                    {format(day, "dd/MM")}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {activeUsers.map((user) => (
                            <TableRow key={user._id || user.id} hover>
                                <TableCell
                                    component="th"
                                    scope="row"
                                    sx={{
                                        fontWeight: "bold",
                                        position: "sticky",
                                        left: 0,
                                        bgcolor: "background.paper",
                                        zIndex: 10,
                                    }}
                                >
                                    {user.displayName}
                                </TableCell>
                                {weekDays.map((day) => {
                                    const shift = getShiftForCell(
                                        user._id || user.id,
                                        day,
                                    );
                                    const shiftType = shift
                                        ? getShiftType(shift.shiftTypeId)
                                        : null;

                                    const isSelected =
                                        selectedCell?.userId ===
                                            (user._id || user.id) &&
                                        selectedCell?.date &&
                                        isSameDay(selectedCell.date, day);

                                    return (
                                        <TableCell
                                            key={day.toISOString()}
                                            align="center"
                                            onClick={(e) =>
                                                onCellClick(
                                                    e,
                                                    user._id || user.id,
                                                    day,
                                                )
                                            }
                                            sx={{
                                                cursor:
                                                    isShiftManager || isAdmin
                                                        ? "pointer"
                                                        : "default",
                                                bgcolor: shiftType
                                                    ? `${shiftType.color}40`
                                                    : "inherit",
                                                border: isSelected
                                                    ? "2px solid blue"
                                                    : undefined,
                                            }}
                                        >
                                            {shiftType ? (
                                                <Chip
                                                    label={shiftType.name}
                                                    size="small"
                                                    sx={{
                                                        bgcolor:
                                                            shiftType.color,
                                                        color: getContrastText(
                                                            shiftType.color,
                                                        ),
                                                        fontWeight: "bold",
                                                        border: "1px solid rgba(0,0,0,0.1)",
                                                    }}
                                                />
                                            ) : isShiftManager || isAdmin ? (
                                                <Box
                                                    sx={{
                                                        opacity: 0.1,
                                                        fontSize: "20px",
                                                    }}
                                                >
                                                    +
                                                </Box>
                                            ) : (
                                                "-"
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    },
);

// עטיפה ב-memo כדי למנוע רינדורים מיותרים כשהאבא משתנה אבל הנתונים של הטבלה לא
export default React.memo(ScheduleTable);
