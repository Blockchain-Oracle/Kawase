ALTER TABLE "users" ADD COLUMN "voice_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;
