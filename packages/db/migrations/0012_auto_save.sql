ALTER TYPE "public"."automation_kind" ADD VALUE 'auto_save';--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "move" jsonb;