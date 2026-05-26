-- Extend store theme JSON with configurable body and heading font-family values.
ALTER TABLE "Store"
ALTER COLUMN "theme" SET DEFAULT '{"primaryColor":"rgb(110 46 143)","primaryForegroundColor":"rgb(255 255 255)","logoHueRotateDeg":120,"bodyFontFamily":"var(--font-geist-sans)","headingFontFamily":"var(--store-font-body)"}'::jsonb;

UPDATE "Store"
SET "theme" = jsonb_set(
  "theme",
  '{bodyFontFamily}',
  '"var(--font-geist-sans)"'::jsonb
)
WHERE NOT ("theme" ? 'bodyFontFamily');

UPDATE "Store"
SET "theme" = jsonb_set(
  "theme",
  '{headingFontFamily}',
  '"var(--store-font-body)"'::jsonb
)
WHERE NOT ("theme" ? 'headingFontFamily');

UPDATE "Store"
SET "theme" =
  "theme" ||
  '{"bodyFontFamily":"\"Instrument Sans\", var(--font-geist-sans), sans-serif","headingFontFamily":"\"Capitana\", \"Instrument Sans\", var(--font-geist-sans), sans-serif"}'::jsonb
WHERE "slug" = 'arcane-fortress' OR "name" = 'Arcane Fortress';
