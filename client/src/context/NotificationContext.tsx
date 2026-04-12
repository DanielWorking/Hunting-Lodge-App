/**
 * @module NotificationContext
 *
 * Provides a global notification system using Material UI Snackbar and Alert.
 * Allows components to trigger toast-style notifications with different
 * severity levels (success, error, warning, info) without managing individual states.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { Snackbar, Alert, type AlertColor } from "@mui/material";

/**
 * Defines the contract for triggering notifications globally.
 */
interface NotificationContextType {
    /**
     * Triggers a visual notification toast.
     *
     * @param {string}     message   The text content to display in the alert.
     * @param {AlertColor} [severity] The color and icon theme. Defaults to 'success'.
     */
    showNotification: (message: string, severity?: AlertColor) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
    undefined,
);

/**
 * Context provider that manages the visibility and content of the global Snackbar.
 * 
 * Renders a single Snackbar instance at the root level and exposes the
 * showNotification function to all children.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The provider component with the global Snackbar element.
 */
export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [severity, setSeverity] = useState<AlertColor>("success");

    /**
     * Updates the notification state and opens the Snackbar.
     *
     * @param {string}     msg  The message to be displayed.
     * @param {AlertColor} type The severity level of the alert.
     */
    const showNotification = (msg: string, type: AlertColor = "success") => {
        setMessage(msg);
        setSeverity(type);
        setOpen(true);
    };

    /**
     * Closes the Snackbar unless the close event was triggered by clicking outside.
     *
     * @param {React.SyntheticEvent | Event} [event] The event object.
     * @param {string} [reason] The reason why the Snackbar is closing.
     */
    const handleClose = (
        _event?: React.SyntheticEvent | Event,
        reason?: string,
    ) => {
        if (reason === "clickaway") return;
        setOpen(false);
    };

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}

            {/* Global Snackbar instance rendered once at the application level */}
            <Snackbar
                open={open}
                autoHideDuration={3000} // Automatically hide after 3 seconds
                onClose={handleClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            >
                <Alert
                    onClose={handleClose}
                    severity={severity}
                    sx={{ width: "100%" }}
                    variant="filled"
                >
                    {message}
                </Alert>
            </Snackbar>
        </NotificationContext.Provider>
    );
};

/**
 * Custom hook to access the notification system.
 * 
 * Must be used within a NotificationProvider tree.
 *
 * @returns {NotificationContextType} The context value containing showNotification.
 * @throws {Error} If called outside of a NotificationProvider.
 */
export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error(
            "useNotification must be used within a NotificationProvider",
        );
    }
    return context;
};
