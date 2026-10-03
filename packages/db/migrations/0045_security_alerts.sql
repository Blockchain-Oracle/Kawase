ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'device_signed_in';
--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'device_signed_out';
--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'invoice_due';
--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'invoice_overdue';
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "location" text;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "location_at" timestamp with time zone;
