import { z } from "zod";

const colorInputMessage =
  "Use a hex color, rgb(r g b), or an RGB triplet like 110 46 143";

function blankToNull(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeThemeColor(value: string) {
  const trimmed = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1];
    const expanded =
      raw.length === 3
        ? raw
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : raw;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgb(${r} ${g} ${b})`;
  }

  const rgb = /^rgb\((.*)\)$/i.exec(trimmed);
  const colorChannels = rgb?.[1] ?? trimmed;

  const parts = colorChannels.includes(",")
    ? colorChannels.split(",").map((part) => part.trim())
    : colorChannels.trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const channels = parts.map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const parsed = Number(part);
    return parsed >= 0 && parsed <= 255 ? parsed : null;
  });

  if (channels.some((channel) => channel == null)) return null;

  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

const nullableOptionalEmail = z.preprocess(
  blankToNull,
  z.string().email("Enter a valid email").nullable().optional(),
);

const nullableOptionalUrl = z.preprocess(
  blankToNull,
  z.string().url("Enter a valid URL").nullable().optional(),
);

const themeColor = z
  .string()
  .trim()
  .min(1, "Theme color is required")
  .transform((value, ctx) => {
    const normalized = normalizeThemeColor(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: colorInputMessage,
      });
      return z.NEVER;
    }
    return normalized;
  });

const logoHueRotateDeg = z.coerce
  .number()
  .refine((n) => Number.isFinite(n), {
    message: "Logo hue must be a number between 0 and 360",
  })
  .refine((n) => n >= 0 && n <= 360, {
    message: "Logo hue rotation must be between 0 and 360 degrees",
  });

export const superAdminStoreUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  slug: z.string().trim().min(1, "Slug is required"),
  email: nullableOptionalEmail,
  website: nullableOptionalUrl,
  theme: z.object({
    primaryColor: themeColor,
    primaryForegroundColor: themeColor,
    logoHueRotateDeg,
  }),
});

export type SuperAdminStoreFormValues = z.infer<
  typeof superAdminStoreUpdateSchema
>;
