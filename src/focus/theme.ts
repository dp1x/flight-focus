import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

const THEME_KEY = "flight-focus-theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (saved === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}

export function getThemeClass(theme: Theme): string {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}