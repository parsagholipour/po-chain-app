"use client";

import { useEffect } from "react";
import {
  getStoreThemeCssVariables,
  STORE_THEME_VARIABLES,
  type StoreTheme,
} from "@/lib/store-theme";

export function StoreThemeVariables({
  theme,
}: {
  theme: StoreTheme | null;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = new Map(
      STORE_THEME_VARIABLES.map((name) => [
        name,
        root.style.getPropertyValue(name),
      ]),
    );
    const variables = getStoreThemeCssVariables(theme);

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
  }, [theme]);

  return null;
}
