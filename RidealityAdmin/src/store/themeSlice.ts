import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'rideality_theme_mode';

function loadThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export interface ThemeState {
  mode: ThemeMode;
}

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: loadThemeMode() } satisfies ThemeState,
  reducers: {
    setMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      localStorage.setItem(THEME_KEY, action.payload);
    },
    toggleMode(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, state.mode);
    },
  },
});

export const { setMode, toggleMode } = themeSlice.actions;
export default themeSlice.reducer;
