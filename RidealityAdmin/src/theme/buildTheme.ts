import { createTheme } from '@mui/material/styles';
import type { ThemeMode } from '@/store/themeSlice';
import { brandColors, shadows, surface } from '@/theme/designTokens';

export function buildTheme(mode: ThemeMode) {
  const base = createTheme({ palette: { mode } });
  const s = mode === 'light' ? surface.light : surface.dark;

  return createTheme(base, {
    palette: {
      primary: brandColors.primary,
      success: brandColors.success,
      warning: brandColors.warning,
      error: brandColors.error,
      background: { default: s.app, paper: s.paper },
      text: {
        primary: s.textPrimary,
        secondary: s.textSecondary,
      },
      divider: s.border,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.02em', fontFamily: '"Space Grotesk", "Inter", sans-serif' },
      h5: { fontWeight: 700, letterSpacing: '-0.01em', fontFamily: '"Space Grotesk", "Inter", sans-serif' },
      h6: { fontWeight: 600, fontFamily: '"Space Grotesk", "Inter", sans-serif' },
      subtitle1: { fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { scrollbarColor: `${s.textMuted} transparent` },
          '::-webkit-scrollbar': { width: 6, height: 6 },
          '::-webkit-scrollbar-thumb': {
            background: 'rgba(156, 163, 175, 0.25)',
            borderRadius: 10,
          },
          '::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(156, 163, 175, 0.45)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${s.border}`,
            boxShadow: mode === 'light' ? shadows.card : 'none',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 16,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, borderRadius: 12 },
          containedPrimary: {
            background: `linear-gradient(135deg, ${brandColors.primary.main} 0%, ${brandColors.indigo.main} 100%)`,
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
            '&:hover': {
              background: `linear-gradient(135deg, ${brandColors.primary.dark} 0%, ${brandColors.indigo.dark} 100%)`,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 8 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            marginBottom: 2,
            '&.Mui-selected': {
              backgroundColor: s.navActiveBg,
              color: s.navActiveText,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.04)',
              '&:hover': { backgroundColor: s.navActiveBg },
              '& .MuiListItemIcon-root': { color: s.navActiveText },
            },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${s.border}`,
            boxShadow: mode === 'light' ? shadows.sidebar : 'none',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${s.border}`,
            boxShadow: mode === 'light' ? shadows.header : 'none',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: mode === 'light' ? 'rgba(248, 250, 252, 0.7)' : 'rgba(15, 23, 42, 0.5)',
          },
        },
      },
    },
  });
}
