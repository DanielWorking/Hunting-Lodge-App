import {
    createContext,
    useContext,
    useState,
    useMemo,
    useEffect,
    type ReactNode,
} from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { getDesignTokens } from "../theme/theme";
import { type PaletteMode } from "@mui/material";
import { useUser } from "./UserContext";

interface ColorModeContextType {
    toggleColorMode: () => void;
    setMode: (mode: PaletteMode) => void;
    mode: PaletteMode;
}

const ColorModeContext = createContext<ColorModeContextType>({
    toggleColorMode: () => {},
    setMode: () => {},
    mode: "light",
});

export const ColorModeProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useUser(); // מקבלים את המשתמש הנוכחי

    // פונקציית עזר לייצור המפתח הייחודי ב-localStorage
    // אם יש משתמש, המפתח יהיה "themeMode_<USER_ID>"
    // אם אין משתמש (לוגין), המפתח יהיה "themeMode_guest"
    const getThemeKey = (userId?: string) => {
        return userId ? `themeMode_${userId}` : "themeMode_guest";
    };

    const [mode, setModeState] = useState<PaletteMode>("light");

    // 4. אפקט שטוען את ההעדפה ברגע שהמשתמש משתנה (כניסה/יציאה)
    useEffect(() => {
        const key = getThemeKey(user?.id || user?._id);
        const savedMode = localStorage.getItem(key);

        if (savedMode === "dark" || savedMode === "light") {
            setModeState(savedMode);
        } else {
            // ברירת מחדל למשתמש חדש או אורח
            setModeState("light");
        }
    }, [user]); // רץ כל פעם שהמשתמש משתנה

    const colorMode = useMemo(
        () => ({
            toggleColorMode: () => {
                setModeState((prevMode) => {
                    const newMode = prevMode === "light" ? "dark" : "light";

                    // שמירה למפתח הספציפי של המשתמש הנוכחי
                    const key = getThemeKey(user?.id || user?._id);
                    localStorage.setItem(key, newMode);

                    return newMode;
                });
            },
            setMode: (newMode: PaletteMode) => {
                setModeState(newMode);
                // גם בקביעה ישירה, נעדכן את ה-localStorage
                const key = getThemeKey(user?.id || user?._id);
                localStorage.setItem(key, newMode);
            },
            mode,
        }),
        [mode, user], // תלוי גם ב-user כדי שהמפתח יהיה נכון
    );

    const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

    return (
        <ColorModeContext.Provider value={colorMode}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </ColorModeContext.Provider>
    );
};

export const useColorMode = () => useContext(ColorModeContext);
