ALTER TYPE "public"."inbox_kind" ADD VALUE 'rule_alert';--> statement-breakpoint
ALTER TYPE "public"."automation_kind" ADD VALUE 'rule';--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE 'pending';--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "trigger" jsonb;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD COLUMN "trigger_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_event_idx" ON "automation_runs" USING btree ("automation_id","trigger_ref") WHERE "automation_runs"."trigger_ref" is not null;