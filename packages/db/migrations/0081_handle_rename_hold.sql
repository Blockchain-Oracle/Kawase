ALTER TABLE "handle_holds" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "handle_holds" ADD CONSTRAINT "handle_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
