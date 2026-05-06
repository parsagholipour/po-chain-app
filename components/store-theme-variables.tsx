"use client";

import { useEffect, useMemo } from "react";
import {
  DEFAULT_STORE_THEME,
  getStoreThemeCssVariables,
  STORE_THEME_VARIABLES,
  type StoreTheme,
} from "@/lib/store-theme";

export function StoreThemeVariables({
  theme,
}: {
  theme: StoreTheme | null;
}) {
  const primaryColor = theme?.primaryColor ?? DEFAULT_STORE_THEME.primaryColor;
  const primaryForegroundColor =
    theme?.primaryForegroundColor ?? DEFAULT_STORE_THEME.primaryForegroundColor;
  const logoHueRotateDeg =
    theme?.logoHueRotateDeg ?? DEFAULT_STORE_THEME.logoHueRotateDeg;
  const variables = useMemo(
    () =>
      getStoreThemeCssVariables({
        primaryColor,
        primaryForegroundColor,
        logoHueRotateDeg,
      }),
    [logoHueRotateDeg, primaryColor, primaryForegroundColor],
  );

  useEffect(() => {
    const root = document.documentElement;
    const previous = new Map(
      STORE_THEME_VARIABLES.map((name) => [
        name,
        root.style.getPropertyValue(name),
      ]),
    );

    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }

    return () => {
      for (const name of STORE_THEME_VARIABLES) {
        const value = previous.get(name);
        if (value) {
          root.style.setProperty(name, value);
        } else {
          root.style.removeProperty(name);
        }
      }
    };
  }, [variables]);

  return null;
}
