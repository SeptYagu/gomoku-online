"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { resolveCurrentTheme, themeStorageKey, type ThemeMode } from "@/lib/theme";

type ThemeToggleProps = {
  labels: {
    theme: string;
    lightTheme: string;
    darkTheme: string;
  };
};

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

function getThemeSnapshot(): ThemeMode {
  return resolveCurrentTheme();
}

function getServerThemeSnapshot(): ThemeMode {
  return "light";
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => onStoreChange();

  window.addEventListener("storage", handleChange);
  window.addEventListener("gomoku-theme-change", handleChange);
  mediaQuery.addEventListener("change", handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("gomoku-theme-change", handleChange);
    mediaQuery.removeEventListener("change", handleChange);
  };
}

export function ThemeToggle({ labels }: ThemeToggleProps) {
  const theme = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
    window.dispatchEvent(new Event("gomoku-theme-change"));
  }

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? labels.lightTheme : labels.darkTheme}
      className="icon-button"
      onClick={toggleTheme}
      title={labels.theme}
      type="button"
    >
      {isDark ? (
        <Sun aria-hidden="true" focusable={false} suppressHydrationWarning />
      ) : (
        <Moon aria-hidden="true" focusable={false} suppressHydrationWarning />
      )}
    </button>
  );
}
