/**
 * @module ScheduleTable
 * 
 * Renders a grid-based interface for viewing and managing employee shifts.
 * Supports sticky headers, color-coded shift types, and interactive cell 
 * selection for administrative updates.
 */

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

/**
 * Represents a simplified shift record used for grid rendering.
 */
interface LocalShift {
    /** The unique identifier of the employee. */
    userId: string;
    /** The date the shift is scheduled for. */
    date: Date;
    /** The ID of the shift type (e.g., Morning, Evening). */
    shiftTypeId: string;
    /** Whether this shift was deducted from the user's vacation balance. */
    vacationDeducted?: boolean;
}

/**
 * Configuration properties for the {@link ScheduleTable} component.
 */
interface ScheduleTableProps {
    /** If true, the table expands to occupy the full viewport width/height. */
    isFull: boolean;
    /** An array of dates representing the columns of the schedule. */
    weekDays: Date[];
    /** The list of employees to display as table rows. */
    activeUsers: any[];
    /** The list of shifts to be rendered in the grid. */
    shifts: LocalShift[];
    /** The available shift types for color mapping and labeling. */
    shiftTypes: ShiftType[];
    /** Whether the current user has shift management privileges. */
    isShiftManager: boolean;
    /** Whether the current user has administrative privileges. */
    isAdmin: boolean;
    /** The currently highlighted cell, if any. */
    selectedCell: { userId: string; date: Date } | null;
    /** 
     * Callback triggered when a table cell is clicked. 
     * Used for opening edit dialogs or selecting cells.
     */
    onCellClick: (
        event: React.MouseEvent<HTMLTableDataCellElement>,
        userId: string,
        date: Date,
    ) => void;
}

/**
 * Determines whether black or white text should be used on a given background color
 * for optimal readability (WCAG compliance).
 * 
 * @param {string} hexColor  The background color in hex format (e.g., "#FFFFFF").
 * @returns {"black" | "white"} The recommended text color.
 */
const getContrastText = (hexColor: string) => {
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? "black" : "white";
};

/**
 * A specialized table component for displaying employee shift schedules.
 * 
 * Uses `forwardRef` to allow parent components to control the container 
 * (e.g., for full-screen transitions).
 */
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
        /**
         * Finds the shift assigned to a specific user on a specific date.
         * 
         * @param {string} userId  The ID of the employee.
         * @param {Date} date      The date to check.
         * @returns {LocalShift | undefined} The shift if found, otherwise undefined.
         */
        const getShiftForCell = (userId: string, date: Date) => {
            return shifts.find(
                (s) => s.userId === userId && isSameDay(s.date, date),
            );
        };

        /**
         * Resolves a shift type object from its ID.
         * 
         * @param {string} id  The ID of the shift type.
         * @returns {ShiftType | undefined} The shift type object if found.
         */
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
                ref={ref}
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

/**
 * Memoized version of ScheduleTable to prevent unnecessary re-renders when 
 * parent state changes do not affect the schedule data.
 */
export default React.memo(ScheduleTable);
