import type { CSSProperties } from "react";

export const DEFAULT_THEME_PRIMARY_COLOR = "rgb(110 46 143)";
export const DEFAULT_THEME_PRIMARY_FOREGROUND_COLOR = "rgb(255 255 255)";
/** Default hue-rotate for `/logo.png` (green asset -> purple at 120deg). */
export const DEFAULT_LOGO_HUE_ROTATE_DEG = 120;
export const DEFAULT_THEME_BODY_FONT_FAMILY = "var(--font-geist-sans)";
export const DEFAULT_THEME_HEADING_FONT_FAMILY = "var(--store-font-body)";
export const INSTRUMENT_SANS_FONT_FAMILY =
  '"Instrument Sans", var(--font-geist-sans), sans-serif';
export const CAPITANA_FONT_FAMILY =
  '"Capitana", "Instrument Sans", var(--font-geist-sans), sans-serif';

export type StoreTheme = {
  primaryColor: string;
  primaryForegroundColor: string;
  logoHueRotateDeg: number;
  bodyFontFamily: string;
  headingFontFamily: string;
};

export const DEFAULT_STORE_THEME: StoreTheme = {
  primaryColor: DEFAULT_THEME_PRIMARY_COLOR,
  primaryForegroundColor: DEFAULT_THEME_PRIMARY_FOREGROUND_COLOR,
  logoHueRotateDeg: DEFAULT_LOGO_HUE_ROTATE_DEG,
  bodyFontFamily: DEFAULT_THEME_BODY_FONT_FAMILY,
  headingFontFamily: DEFAULT_THEME_HEADING_FONT_FAMILY,
};

export const ARCANE_FORTRESS_STORE_THEME: StoreTheme = {
  ...DEFAULT_STORE_THEME,
  bodyFontFamily: INSTRUMENT_SANS_FONT_FAMILY,
  headingFontFamily: CAPITANA_FONT_FAMILY,
};

export const STORE_BODY_FONT_FAMILY_OPTIONS = [
  { value: DEFAULT_THEME_BODY_FONT_FAMILY, label: "Default" },
  { value: INSTRUMENT_SANS_FONT_FAMILY, label: "Instrument Sans" },
  { value: CAPITANA_FONT_FAMILY, label: "Capitana" },
] as const;

export const STORE_HEADING_FONT_FAMILY_OPTIONS = [
  { value: DEFAULT_THEME_HEADING_FONT_FAMILY, label: "Default" },
  { value: CAPITANA_FONT_FAMILY, label: "Capitana" },
  { value: INSTRUMENT_SANS_FONT_FAMILY, label: "Instrument Sans" },
] as const;

export const STORE_FONT_FAMILY_OPTIONS = [
  ...STORE_HEADING_FONT_FAMILY_OPTIONS,
  ...STORE_BODY_FONT_FAMILY_OPTIONS,
] as const;

function normalizeLogoHueRotateDeg(value: unknown): number {
  let n: number;
  if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else if (typeof value === "string") {
    const parsed = Number(value.trim());
    n = Number.isFinite(parsed) ? parsed : DEFAULT_LOGO_HUE_ROTATE_DEG;
  } else {
    return DEFAULT_LOGO_HUE_ROTATE_DEG;
  }
  let mod = n % 360;
  if (mod < 0) mod += 360;
  return mod;
}

export function isSafeStoreFontFamily(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 240 &&
    !/[;{}<>]/.test(trimmed) &&
    !/url\s*\(/i.test(trimmed) &&
    !/[\u0000-\u001f\u007f]/.test(trimmed)
  );
}

function normalizeFontFamily(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return isSafeStoreFontFamily(trimmed) ? trimmed : fallback;
}

export const STORE_THEME_VARIABLES = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--store-font-body",
  "--store-font-heading",
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
    logoHueRotateDeg: normalizeLogoHueRotateDeg(values.logoHueRotateDeg),
    bodyFontFamily: normalizeFontFamily(
      values.bodyFontFamily,
      DEFAULT_THEME_BODY_FONT_FAMILY,
    ),
    headingFontFamily: normalizeFontFamily(
      values.headingFontFamily,
      DEFAULT_THEME_HEADING_FONT_FAMILY,
    ),
  };
}

export function getStoreThemeCssVariables(theme: unknown) {
  const normalizedTheme = normalizeStoreTheme(theme);
  const primary = normalizedTheme.primaryColor;
  const foreground = normalizedTheme.primaryForegroundColor;
  const bodyFont = normalizedTheme.bodyFontFamily;
  const headingFont = normalizedTheme.headingFontFamily;

  return {
    "--primary": primary,
    "--primary-foreground": foreground,
    "--ring": primary,
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": primary,
    "--store-font-body": bodyFont,
    "--store-font-heading": headingFont,
  };
}

export function getStoreThemeStyle(theme: unknown): CSSProperties {
  return getStoreThemeCssVariables(theme) as CSSProperties;
}

export function logoHueRotateFilterStyle(deg: number): CSSProperties {
  const n = normalizeLogoHueRotateDeg(deg);
  if (n === 0) return {};
  return { filter: `hue-rotate(${n}deg)` };
}
