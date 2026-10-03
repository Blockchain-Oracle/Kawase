ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_hide_amounts" boolean DEFAULT false NOT NULL;
