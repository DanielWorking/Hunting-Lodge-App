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

interface ColorModeContextType {
    toggleColorMode: () => void;
    setMode: (mode: PaletteMode) => void; // <-- הפונקציה החדשה
    mode: PaletteMode;
}

const ColorModeContext = createContext<ColorModeContextType>({
    toggleColorMode: () => {},
    setMode: () => {}, // ערך ברירת מחדל
    mode: "light",
});

export const ColorModeProvider = ({ children }: { children: ReactNode }) => {
    const [mode, setModeState] = useState<PaletteMode>(() => {
        const savedMode = localStorage.getItem("themeMode");
        return savedMode === "dark" || savedMode === "light"
            ? savedMode
            : "light";
    });

    useEffect(() => {
        localStorage.setItem("themeMode", mode);
    }, [mode]);

    const colorMode = useMemo(
        () => ({
            // החלפת מצב (לכפתור ב-Navbar)
            toggleColorMode: () => {
                setModeState((prevMode) =>
                    prevMode === "light" ? "dark" : "light"
                );
            },
            // קביעת מצב ספציפי (בשביל דף הלוגין)
            setMode: (newMode: PaletteMode) => {
                setModeState(newMode);
            },
            mode,
        }),
        [mode]
    );

    const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

    return (
        <ColorModeContext.Provider value={colorMode}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </ColorModeContext.Provider>
    );
};

export const useColorMode = () => useContext(ColorModeContext);
