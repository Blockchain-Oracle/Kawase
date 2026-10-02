ALTER TABLE "invoices" ADD COLUMN "token_address" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "decimals" integer DEFAULT 6 NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_public_token_idx" ON "invoices" ("public_token") WHERE "public_token" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reminded" text;
--> statement-breakpoint
ALTER TABLE "payout_batches" ADD COLUMN "token_address" text;
--> statement-breakpoint
ALTER TABLE "payout_batches" ADD COLUMN "decimals" integer DEFAULT 6 NOT NULL;
