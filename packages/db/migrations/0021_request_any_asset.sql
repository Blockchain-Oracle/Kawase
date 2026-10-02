ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "asset_symbol" text;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN IF NOT EXISTS "asset_decimals" integer;
