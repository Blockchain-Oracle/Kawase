ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'request_received';--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "payer_user_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_requests_payer_idx" ON "payment_requests" USING btree ("payer_user_id","status");
