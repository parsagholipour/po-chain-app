-- Extend store theme JSON with logo CSS hue-rotate (degrees). Default 120 shifts the green asset toward purple to match the default primary palette.
ALTER TABLE "Store"
ALTER COLUMN "theme" SET DEFAULT '{"primaryColor":"rgb(110 46 143)","primaryForegroundColor":"rgb(255 255 255)","logoHueRotateDeg":120}'::jsonb;

UPDATE "Store"
SET "theme" = "theme" || '{"logoHueRotateDeg":120}'::jsonb
WHERE NOT ("theme" ? 'logoHueRotateDeg');
