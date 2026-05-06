ALTER TABLE "Store"
ADD COLUMN IF NOT EXISTS "theme" JSONB NOT NULL DEFAULT '{"primaryColor":"rgb(110 46 143)","primaryForegroundColor":"rgb(255 255 255)"}'::jsonb;
