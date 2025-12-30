import { type PaletteMode } from '@mui/material';

// פונקציה שמחזירה את הגדרות העיצוב לפי המצב הנבחר
export const getDesignTokens = (mode: PaletteMode) => ({
    palette: {
        mode, // כאן נקבע אם זה 'light' או 'dark'
        ...(mode === 'light'
            ? {
                // === מצב בהיר (מה שהיה לנו עד עכשיו) ===
                primary: {
                    main: '#2E7D32', // ירוק יער
                    light: '#60AD5E',
                    dark: '#005005',
                    contrastText: '#ffffff',
                },
                secondary: {
                    main: '#795548', // חום
                    light: '#A98274',
                    dark: '#4B2C20',
                    contrastText: '#ffffff',
                },
                background: {
                    default: '#F4F6F8',
                    paper: '#FFFFFF',
                },
                text: {
                    primary: 'rgba(0, 0, 0, 0.87)',
                    secondary: 'rgba(0, 0, 0, 0.6)',
                },
            }
            : {
                // === מצב כהה (חדש!) ===
                primary: {
                    main: '#66BB6A', // ירוק בהיר יותר שיראה טוב על שחור
                    light: '#81C784',
                    dark: '#388E3C',
                    contrastText: '#000000',
                },
                secondary: {
                    main: '#A1887F', // חום בהיר יותר
                    light: '#D7CCC8',
                    dark: '#5D4037',
                    contrastText: '#000000',
                },
                background: {
                    default: '#121212', // צבע רקע כהה סטנדרטי
                    paper: '#1E1E1E',   // צבע לכרטיסים (קצת יותר בהיר מהרקע)
                },
                text: {
                    primary: '#ffffff',
                    secondary: 'rgba(255, 255, 255, 0.7)',
                },
            }),
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        h4: { fontWeight: 600 },
        h6: { fontWeight: 500 },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none' as const,
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 12,
                    // צל עדין יותר במצב כהה
                    boxShadow: mode === 'dark' ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.05)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    // ב-Dark Mode ה-Navbar יהיה כהה, ב-Light הוא יהיה לבן
                    backgroundColor: mode === 'dark' ? '#1E1E1E' : '#ffffff',
                    color: mode === 'dark' ? '#ffffff' : '#2E7D32',
                },
            },
        },
    },
});