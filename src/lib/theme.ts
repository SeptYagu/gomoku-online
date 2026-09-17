export type ThemeMode = "light" | "dark";

export const themeStorageKey = "gomoku-theme";

/**
 * 权威主题解析源：与 ThemeScript.tsx 和 ThemeToggle.tsx 保持 100% 严格一致。
 * localStorage 存储值优先；若未设置，则继承系统 matchMedia 偏好；服务端回落为 light。
 */
export function resolveCurrentTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
