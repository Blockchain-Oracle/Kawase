ALTER TABLE "payment_requests" ADD COLUMN "asset_symbol" text;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD COLUMN "asset_decimals" integer;
