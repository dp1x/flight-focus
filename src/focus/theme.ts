import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const THEME_KEY = "flight-focus-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeState {
  preference: Theme;
  resolved: ResolvedTheme;
}

function storedPreference(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light" || saved === "system") return saved;
  return "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(preference: Theme): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function initialThemeState(): ThemeState {
  const preference = storedPreference();
  return { preference, resolved: resolve(preference) };
}

/**
 * Theme preference plus its resolved value. "system" follows the OS setting and
 * keeps following it if the OS changes while the app is open. The resolved
 * theme is written to `data-theme` on the document root, which is what the
 * stylesheet keys its light-mode overrides off.
 */
export function useTheme() {
  const [state, setState] = useState<ThemeState>(initialThemeState);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, state.preference);
  }, [state.preference]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", state.resolved);
  }, [state.resolved]);

  // Only "system" needs to react to OS changes.
  useEffect(() => {
    if (state.preference !== "system") return;

    const media = window.matchMedia(DARK_QUERY);
    const sync = () =>
      setState((current) => {
        const resolved = media.matches ? "dark" : "light";
        return current.resolved === resolved ? current : { ...current, resolved };
      });

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [state.preference]);

  const setTheme = useCallback((preference: Theme) => {
    setState({ preference, resolved: resolve(preference) });
  }, []);

  return { theme: state.resolved, preference: state.preference, setTheme };
}
