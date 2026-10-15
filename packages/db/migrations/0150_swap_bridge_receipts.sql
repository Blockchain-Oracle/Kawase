ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'swap_completed';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'bridge_completed';
