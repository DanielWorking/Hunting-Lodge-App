import { createContext, useContext, useState, type ReactNode } from "react";
import { Snackbar, Alert, type AlertColor } from "@mui/material";

// הגדרת סוגי הנתונים של ההודעה
interface NotificationContextType {
    showNotification: (message: string, severity?: AlertColor) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
    undefined
);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [severity, setSeverity] = useState<AlertColor>("success"); // 'success' | 'error' | 'warning' | 'info'

    // הפונקציה שתקרא לה מכל מקום באתר
    const showNotification = (msg: string, type: AlertColor = "success") => {
        setMessage(msg);
        setSeverity(type);
        setOpen(true);
    };

    const handleClose = (
        event?: React.SyntheticEvent | Event,
        reason?: string
    ) => {
        if (reason === "clickaway") return;
        setOpen(false);
    };

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}

            {/* הרכיב הוויזואלי יושב כאן פעם אחת ולתמיד */}
            <Snackbar
                open={open}
                autoHideDuration={3000} // נעלם אחרי 3 שניות
                onClose={handleClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }} // מיקום: ימין למטה
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

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error(
            "useNotification must be used within a NotificationProvider"
        );
    }
    return context;
};
