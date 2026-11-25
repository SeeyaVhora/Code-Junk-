import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "cj-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Theme preference persisted locally; synced with UserPreferences.theme once signed in (Phase 3). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme | null) ?? "system");
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    apply(theme);
    const mq = media();
    const onChange = () => {
      setSystemDark(mq.matches);
      if (theme === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(KEY, t);
    setThemeState(t);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);
  return { theme, setTheme, isDark };
}
