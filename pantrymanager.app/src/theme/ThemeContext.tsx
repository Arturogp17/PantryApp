import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { DEFAULT_THEME, ThemeId, ThemeTokens, THEMES, isThemeId } from "./themes";

const STORAGE_KEY = "pantry.theme";

interface AppThemeContextType {
  themeId: ThemeId;
  tokens: ThemeTokens;
  setThemeId: (id: ThemeId) => void;
}

const AppThemeContext = createContext<AppThemeContextType>({
  themeId: DEFAULT_THEME,
  tokens: THEMES[DEFAULT_THEME],
  setThemeId: () => {},
});

const readStoredTheme = (): ThemeId => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

// Convierte los valores del tema en un tema de MUI para que botones, diálogos y campos
// de todas las pantallas sigan el diseño elegido.
const buildMuiTheme = (t: ThemeTokens) =>
  createTheme({
    palette: {
      mode: t.mode,
      primary: { main: t.primary, contrastText: t.onPrimary },
      secondary: { main: t.accent, contrastText: t.onAccent },
      background: { default: t.bg, paper: t.surface },
      text: { primary: t.text, secondary: t.muted },
      divider: t.line,
    },
    shape: { borderRadius: t.radius },
    typography: {
      fontFamily: t.fontBody,
      h4: { fontFamily: t.fontDisplay, fontWeight: 800 },
      h5: { fontFamily: t.fontDisplay, fontWeight: 800 },
      h6: { fontFamily: t.fontDisplay, fontWeight: 800 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: t.bg, color: t.text },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            fontWeight: 700,
            minHeight: 44,
            border: t.border === "none" ? undefined : t.border,
            boxShadow: t.shadow,
            "&:hover": { boxShadow: t.shadow },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: t.border === "none" ? undefined : t.border,
            boxShadow: t.shadow === "none" ? undefined : t.shadow,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: 44, minHeight: 44 } },
      },
    },
  });

export const AppThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeIdState] = useState<ThemeId>(readStoredTheme);
  const tokens = THEMES[themeId];
  const muiTheme = useMemo(() => buildMuiTheme(tokens), [tokens]);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Sin acceso a localStorage: el tema solo dura esta sesión.
    }
  }, []);

  // El color de la barra del navegador en el teléfono sigue al tema.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.bg);
  }, [tokens.bg]);

  const value = useMemo(() => ({ themeId, tokens, setThemeId }), [themeId, tokens, setThemeId]);

  return (
    <AppThemeContext.Provider value={value}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(AppThemeContext);
