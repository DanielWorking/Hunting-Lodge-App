/**
 * @module ThemeContext
 *
 * Manages the application's visual theme mode (light or dark).
 * Synchronizes the theme preference with localStorage, using user-specific
 * keys to ensure different users on the same device maintain their own settings.
 */

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

/**
 * Defines the theme control interface.
 */
interface ColorModeContextType {
    /** Toggles the current mode between 'light' and 'dark'. */
    toggleColorMode: () => void;
    /** Directly sets the theme mode. */
    setMode: (mode: PaletteMode) => void;
    /** The currently active theme mode. */
    mode: PaletteMode;
}

const ColorModeContext = createContext<ColorModeContextType>({
    toggleColorMode: () => {},
    setMode: () => {},
    mode: "light",
});

/**
 * Provider component that wraps the Material UI ThemeProvider.
 * 
 * It monitors the user's session state and updates the theme mode 
 * based on their stored preferences.
 *
 * @param {Object} props - Component properties.
 * @param {ReactNode} props.children - The child components that will consume the context.
 * @returns {JSX.Element} The theme provider component.
 */
export const ColorModeProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useUser();

    /**
     * Generates a unique storage key based on the user's ID.
     * 
     * This ensures that theme preferences are isolated per user profile.
     * If no user is logged in, it falls back to a guest key.
     *
     * @param {string} [userId] - The user's unique identifier.
     * @returns {string} The formatted localStorage key.
     */
    const getThemeKey = (userId?: string) => {
        return userId ? `themeMode_${userId}` : "themeMode_guest";
    };

    const [mode, setModeState] = useState<PaletteMode>("light");

    /**
     * Loads the stored preference whenever the user session changes (login/logout).
     * If no valid preference is found, it defaults to 'light'.
     */
    useEffect(() => {
        const key = getThemeKey(user?.id || user?._id);
        const savedMode = localStorage.getItem(key);

        if (savedMode === "dark" || savedMode === "light") {
            setModeState(savedMode);
        } else {
            setModeState("light");
        }
    }, [user]);

    const colorMode = useMemo(
        () => ({
            /**
             * Flips the theme mode and persists it to the user-specific storage key.
             */
            toggleColorMode: () => {
                setModeState((prevMode) => {
                    const newMode = prevMode === "light" ? "dark" : "light";

                    const key = getThemeKey(user?.id || user?._id);
                    localStorage.setItem(key, newMode);

                    return newMode;
                });
            },
            /**
             * Explicitly sets the theme mode and updates the user's persistent preference.
             * 
             * @param {PaletteMode} newMode - The mode to apply.
             */
            setMode: (newMode: PaletteMode) => {
                setModeState(newMode);
                const key = getThemeKey(user?.id || user?._id);
                localStorage.setItem(key, newMode);
            },
            mode,
        }),
        [mode, user],
    );

    const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

    return (
        <ColorModeContext.Provider value={colorMode}>
            <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </ColorModeContext.Provider>
    );
};

/**
 * Custom hook to access and control the theme mode.
 * 
 * @returns {ColorModeContextType} The theme control object.
 */
export const useColorMode = () => useContext(ColorModeContext);
