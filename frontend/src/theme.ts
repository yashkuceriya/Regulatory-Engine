import { createTheme } from '@mui/material/styles'

// Warm architectural palette — inspired by Cover's brand (wood, homes, craft)

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3d2c24', light: '#5a4238', dark: '#2a1d17', contrastText: '#fff' },
    secondary: { main: '#c17855', light: '#d4956f', dark: '#a5623e' },
    success: { main: '#4a7c59', light: '#5e9970', dark: '#3a6247' },
    warning: { main: '#c17855', light: '#d4956f', dark: '#a5623e' },
    error: { main: '#b94a3e', light: '#cf6356', dark: '#943b32' },
    background: { default: '#f5f0eb', paper: '#ffffff' },
    divider: '#e5ddd5',
    text: { primary: '#2a1d17', secondary: '#7a6e65', disabled: '#b0a69d' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    h4: { fontWeight: 700, letterSpacing: '-0.5px' },
    h5: { fontWeight: 700, letterSpacing: '-0.3px' },
    h6: { fontWeight: 700, letterSpacing: '-0.2px' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, fontSize: '0.85rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem' },
    overline: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.8px' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #e5ddd5', boxShadow: '0 1px 3px rgba(61,44,36,0.04)' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, fontSize: '0.7rem' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', minHeight: 44 } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, borderRadius: 8 }, containedPrimary: { boxShadow: '0 2px 8px rgba(61,44,36,0.2)' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: '#ffffff', color: '#3d2c24' } } },
    MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { backgroundColor: '#faf7f4' } } } },
  },
})

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#d4956f', light: '#e8b898', dark: '#c17855', contrastText: '#1a1210' },
    secondary: { main: '#c17855', light: '#d4956f', dark: '#a5623e' },
    success: { main: '#5e9970', light: '#7bb894', dark: '#4a7c59' },
    warning: { main: '#d4956f', light: '#e8b898', dark: '#c17855' },
    error: { main: '#cf6356', light: '#e8837a', dark: '#b94a3e' },
    background: { default: '#1a1210', paper: '#231c18' },
    divider: '#3d3230',
    text: { primary: '#e8ddd4', secondary: '#a89888', disabled: '#6b5d54' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    h4: { fontWeight: 700, letterSpacing: '-0.5px' },
    h5: { fontWeight: 700, letterSpacing: '-0.3px' },
    h6: { fontWeight: 700, letterSpacing: '-0.2px' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, fontSize: '0.85rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem' },
    overline: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.8px' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #3d3230', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, fontSize: '0.7rem' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', minHeight: 44 } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, borderRadius: 8 }, containedPrimary: { boxShadow: '0 2px 8px rgba(0,0,0,0.4)' } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundColor: '#231c18', color: '#e8ddd4' } } },
    MuiTextField: { styleOverrides: { root: { '& .MuiOutlinedInput-root': { backgroundColor: '#2a2220' } } } },
  },
})

// Backward compat — default export is light
export const theme = lightTheme
