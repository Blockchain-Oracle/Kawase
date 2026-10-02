-- Automations 8c (cards/automate-safety.md "Automate anything"): payroll (a scheduled batch) and DCA (a scheduled
-- swap) as kinds, runs that wait for the person ("Needs you") or were practice ("would have"), practice automations,
-- the 24 h reminder, and the Needs-you queue itself.
ALTER TYPE "public"."automation_kind" ADD VALUE IF NOT EXISTS 'payroll';
--> statement-breakpoint
ALTER TYPE "public"."automation_kind" ADD VALUE IF NOT EXISTS 'dca';
--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'needs_you';
--> statement-breakpoint
ALTER TYPE "public"."automation_run_status" ADD VALUE IF NOT EXISTS 'practiced';
--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'needs_you';
--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'automation_reminder';
--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "practice" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "automations" ADD COLUMN "reminded_for" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "attention_items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "automation_id" uuid REFERENCES "automations"("id") ON DELETE CASCADE,
  "run_id" uuid,
  "kind" text NOT NULL,
  "reason" text NOT NULL,
  "reason_params" jsonb,
  "request" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "intent_id" uuid,
  "intent_kind" text,
  "decided_at" timestamp with time zone,
  "decided_via" text,
  "expires_at" timestamp with time zone NOT NULL,
  "reminded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attention_items_user_idx" ON "attention_items" ("user_id", "network", "status", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "attention_items_run_idx" ON "attention_items" ("run_id") WHERE "run_id" IS NOT NULL;
