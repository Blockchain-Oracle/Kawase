ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "voice_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;
