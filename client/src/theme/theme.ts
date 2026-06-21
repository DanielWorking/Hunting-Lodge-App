/**
 * @module ThemeConfiguration
 *
 * Defines the application's visual style and Material UI theme tokens.
 * This file manages the color palettes, typography, and component overrides
 * for both light and dark modes.
 */

import { type PaletteMode } from '@mui/material';

/**
 * Generates the Material UI design tokens based on the current palette mode.
 *
 * Provides a cohesive visual language by switching between predefined
 * light and dark color schemes and component styling.
 *
 * @param {PaletteMode} mode - The active theme mode ('light' or 'dark').
 * @returns {Object} An object containing palette, typography, and component overrides.
 */
export const getDesignTokens = (mode: PaletteMode) => ({
    palette: {
        mode,
        ...(mode === 'light'
            ? {
                // Light mode color palette - Data Dense Dashboard
                primary: {
                    main: '#7C3AED',
                    light: '#A78BFA',
                    dark: '#5B21B6',
                    contrastText: '#ffffff',
                },
                secondary: {
                    main: '#F97316', // Action Orange for CTA
                    light: '#FB923C',
                    dark: '#C2410C',
                    contrastText: '#ffffff',
                },
                background: {
                    default: '#FAF5FF',
                    paper: '#FFFFFF',
                },
                text: {
                    primary: '#4C1D95',
                    secondary: '#6D28D9',
                },
            }
            : {
                // Dark mode color palette
                primary: {
                    main: '#A78BFA',
                    light: '#C4B5FD',
                    dark: '#7C3AED',
                    contrastText: '#000000',
                },
                secondary: {
                    main: '#FB923C',
                    light: '#FDBA74',
                    dark: '#EA580C',
                    contrastText: '#000000',
                },
                background: {
                    default: '#0F172A',
                    paper: '#1E293B',
                },
                text: {
                    primary: '#F8FAFC',
                    secondary: '#CBD5E1',
                },
            }),
    },
    typography: {
        fontFamily: '"Fira Sans", "Fira Code", sans-serif',
        h1: { fontFamily: '"Fira Code", monospace', fontWeight: 700 },
        h2: { fontFamily: '"Fira Code", monospace', fontWeight: 700 },
        h3: { fontFamily: '"Fira Code", monospace', fontWeight: 600 },
        h4: { fontFamily: '"Fira Code", monospace', fontWeight: 600 },
        h5: { fontFamily: '"Fira Code", monospace', fontWeight: 500 },
        h6: { fontFamily: '"Fira Code", monospace', fontWeight: 500 },
        button: { fontFamily: '"Fira Code", monospace', fontWeight: 500 },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 6,
                    textTransform: 'none' as const,
                    fontWeight: 600,
                    transition: 'all 0.2s ease-in-out',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    boxShadow: mode === 'dark' ? '0 4px 6px -1px rgba(0, 0, 0, 0.5)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    backgroundImage: 'none',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: mode === 'dark' ? '#1E293B' : '#ffffff',
                    color: mode === 'dark' ? '#F8FAFC' : '#4C1D95',
                    boxShadow: 'none',
                    borderBottom: `1px solid ${mode === 'dark' ? '#334155' : '#E2E8F0'}`,
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    padding: '8px 12px', // Tighter padding for data density
                    fontFamily: '"Fira Code", monospace',
                    fontSize: '0.875rem',
                    borderColor: mode === 'dark' ? '#334155' : '#E2E8F0',
                },
                head: {
                    fontWeight: 600,
                    backgroundColor: mode === 'dark' ? '#0F172A' : '#F8FAFC',
                    color: mode === 'dark' ? '#CBD5E1' : '#64748B',
                },
            },
        },
        MuiTableRow: {
            styleOverrides: {
                root: {
                    transition: 'background-color 0.15s ease',
                    '&:hover': {
                        backgroundColor: mode === 'dark' ? '#334155' : '#F1F5F9',
                    },
                },
            },
        },
    },
});