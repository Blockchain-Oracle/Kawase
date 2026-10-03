ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'request_received';--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "payer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_requests_payer_idx" ON "payment_requests" USING btree ("payer_user_id","status");
