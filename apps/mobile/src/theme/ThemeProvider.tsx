import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

import { getPreference, setPreference } from "../lib/storage";
import { darkPalette, lightPalette, type ColorScheme, type Palette, type ThemeMode } from "./palette";

const THEME_KEY = "elite-task-theme";

interface ThemeState {
  mode: ThemeMode;
  scheme: ColorScheme;
  colors: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void getPreference(THEME_KEY).then((saved) => {
      if (isThemeMode(saved)) setModeState(saved);
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void setPreference(THEME_KEY, next);
  }, []);

  const scheme: ColorScheme = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const value = useMemo<ThemeState>(
    () => ({ mode, scheme, colors: scheme === "dark" ? darkPalette : lightPalette, setMode }),
    [mode, scheme, setMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

/**
 * Стили зависят от палитры, поэтому каждый файл описывает фабрику
 * `(colors) => StyleSheet.create(...)`, а хук пересоздаёт стили только при смене темы.
 */
export function useStyles<T>(factory: (colors: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
