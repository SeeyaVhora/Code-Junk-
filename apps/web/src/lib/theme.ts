import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "cj-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

/*
 * One shared store, so every component using useTheme (e.g. the desktop and mobile
 * toggles on the same page) sees the same value. Synced with UserPreferences.theme in Phase 3.
 */
const listeners = new Set<() => void>();
const read = (): Theme => (localStorage.getItem(KEY) as Theme | null) ?? "system";

function apply() {
  const t = read();
  const dark = t === "dark" || (t === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = media();
  const onSystem = () => {
    apply();
    cb();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onSystem(); // another tab changed it
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read);
  const systemDark = useSyncExternalStore(subscribe, () => media().matches);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(KEY, t);
    apply();
    listeners.forEach((l) => l());
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);
  return { theme, setTheme, isDark };
}
