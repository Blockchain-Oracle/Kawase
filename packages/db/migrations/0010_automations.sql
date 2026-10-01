CREATE TYPE "public"."automation_kind" AS ENUM('scheduled_send');--> statement-breakpoint
CREATE TYPE "public"."automation_run_status" AS ENUM('executing', 'succeeded', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."automation_status" AS ENUM('draft', 'active', 'paused', 'canceled', 'ended');--> statement-breakpoint
ALTER TYPE "public"."approval_route" ADD VALUE 'automation';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE 'automation_skipped';--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"automation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "automation_run_status" DEFAULT 'executing' NOT NULL,
	"reason" text,
	"reason_params" jsonb,
	"intent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" "automation_kind" NOT NULL,
	"status" "automation_status" DEFAULT 'draft' NOT NULL,
	"thread_id" uuid,
	"schedule" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"grant_id" uuid,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"ends_at" timestamp with time zone NOT NULL,
	"runs_done" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_runs_once_idx" ON "automation_runs" USING btree ("automation_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "automation_runs_open_idx" ON "automation_runs" USING btree ("status") WHERE "automation_runs"."status" = 'executing';--> statement-breakpoint
CREATE INDEX "automations_due_idx" ON "automations" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "automations_user_idx" ON "automations" USING btree ("user_id","network");