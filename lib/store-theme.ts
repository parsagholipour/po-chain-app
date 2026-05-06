import type { CSSProperties } from "react";

export const DEFAULT_THEME_PRIMARY_COLOR = "rgb(110 46 143)";
export const DEFAULT_THEME_PRIMARY_FOREGROUND_COLOR = "rgb(255 255 255)";

export type StoreTheme = {
  primaryColor: string;
  primaryForegroundColor: string;
};

export const DEFAULT_STORE_THEME: StoreTheme = {
  primaryColor: DEFAULT_THEME_PRIMARY_COLOR,
  primaryForegroundColor: DEFAULT_THEME_PRIMARY_FOREGROUND_COLOR,
};

export const STORE_THEME_VARIABLES = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
] as const;

export function normalizeStoreTheme(theme: unknown): StoreTheme {
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) {
    return DEFAULT_STORE_THEME;
  }

  const values = theme as Record<string, unknown>;
  const primaryColor =
    typeof values.primaryColor === "string" && values.primaryColor.trim()
      ? values.primaryColor
      : DEFAULT_THEME_PRIMARY_COLOR;
  const primaryForegroundColor =
    typeof values.primaryForegroundColor === "string" &&
    values.primaryForegroundColor.trim()
      ? values.primaryForegroundColor
      : DEFAULT_THEME_PRIMARY_FOREGROUND_COLOR;

  return {
    primaryColor,
    primaryForegroundColor,
  };
}

export function getStoreThemeCssVariables(theme: unknown) {
  const normalizedTheme = normalizeStoreTheme(theme);
  const primary = normalizedTheme.primaryColor;
  const foreground = normalizedTheme.primaryForegroundColor;

  return {
    "--primary": primary,
    "--primary-foreground": foreground,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": primary,
  };
}

export function getStoreThemeStyle(theme: unknown): CSSProperties {
  return getStoreThemeCssVariables(theme) as CSSProperties;
}
