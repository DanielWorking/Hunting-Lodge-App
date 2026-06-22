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
                    main: '#1E40AF',
                },
                secondary: {
                    main: '#3B82F6',
                },
                warning: {
                    main: '#F59E0B', // CTA/Accent
                },
                background: {
                    default: '#F8FAFC',
                    paper: '#FFFFFF',
                },
                text: {
                    primary: '#1E3A8A',
                    secondary: '#475569',
                },
                divider: '#E2E8F0',
            }
            : {
                // Dark mode color palette
                primary: {
                    main: '#60A5FA',
                },
                secondary: {
                    main: '#93C5FD',
                },
                warning: {
                    main: '#FBBF24', // CTA/Accent
                },
                background: {
                    default: '#0F172A',
                    paper: '#1E293B',
                },
                text: {
                    primary: '#F8FAFC',
                    secondary: '#94A3B8',
                },
                divider: '#334155',
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
        button: { fontFamily: '"Fira Code", monospace', fontWeight: 600 },
        body1: { fontFamily: '"Fira Sans", sans-serif', fontWeight: 400 },
        body2: { fontFamily: '"Fira Sans", sans-serif', fontWeight: 400 },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none' as const,
                    fontWeight: 600,
                    transition: 'all 200ms ease',
                    padding: '12px 24px',
                    cursor: 'pointer',
                },
                containedPrimary: {
                    backgroundColor: mode === 'light' ? '#F59E0B' : '#FBBF24',
                    color: mode === 'light' ? 'white' : '#0F172A',
                    '&:hover': {
                        backgroundColor: mode === 'light' ? '#F59E0B' : '#FBBF24',
                        opacity: 0.9,
                        transform: 'translateY(-1px)',
                    },
                },
                outlinedPrimary: {
                    backgroundColor: 'transparent',
                    color: mode === 'light' ? '#1E40AF' : '#60A5FA',
                    border: `2px solid ${mode === 'light' ? '#1E40AF' : '#60A5FA'}`,
                    '&:hover': {
                        border: `2px solid ${mode === 'light' ? '#1E40AF' : '#60A5FA'}`,
                        backgroundColor: 'transparent',
                        opacity: 0.9,
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: mode === 'light' ? '#F8FAFC' : '#1E293B',
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: mode === 'light' ? '0 4px 6px rgba(0,0,0,0.1)' : '0 4px 6px rgba(0,0,0,0.3)',
                    transition: 'all 200ms ease',
                    backgroundImage: 'none',
                    cursor: 'pointer',
                    '&:hover': {
                        boxShadow: mode === 'light' ? '0 10px 15px rgba(0,0,0,0.1)' : '0 10px 15px rgba(0,0,0,0.4)',
                        transform: 'translateY(-2px)',
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontSize: 16,
                    transition: 'border-color 200ms ease',
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: mode === 'light' ? '#1E40AF' : '#60A5FA',
                        borderWidth: '1px',
                    },
                    '&.Mui-focused': {
                        boxShadow: mode === 'light' ? '0 0 0 3px #1E40AF20' : '0 0 0 3px #60A5FA20',
                    },
                },
                input: {
                    padding: '12px 16px',
                },
                notchedOutline: {
                    borderColor: mode === 'light' ? '#E2E8F0' : '#334155',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: mode === 'light' ? 'white' : '#1E293B',
                    borderRadius: 16,
                    padding: 32,
                    boxShadow: mode === 'light' ? '0 20px 25px rgba(0,0,0,0.15)' : '0 20px 25px rgba(0,0,0,0.5)',
                    maxWidth: 500,
                    width: '90%',
                },
                paperFullScreen: {
                    maxWidth: 'none',
                    width: '100%',
                    height: '100%',
                    borderRadius: 0,
                    padding: 0,
                },
            },
        },
        MuiBackdrop: {
            styleOverrides: {
                root: {
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: mode === 'dark' ? '#1E293B' : '#ffffff',
                    color: mode === 'dark' ? '#F8FAFC' : '#1E40AF',
                    boxShadow: 'none',
                    borderBottom: `1px solid ${mode === 'dark' ? '#334155' : '#E2E8F0'}`,
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                root: {
                    padding: '8px 12px',
                    fontFamily: '"Fira Code", monospace',
                    fontSize: '0.875rem',
                    borderColor: mode === 'dark' ? '#334155' : '#E2E8F0',
                },
                head: {
                    fontWeight: 600,
                    backgroundColor: mode === 'dark' ? '#0F172A' : '#F8FAFC',
                    color: mode === 'dark' ? '#94A3B8' : '#1E3A8A',
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