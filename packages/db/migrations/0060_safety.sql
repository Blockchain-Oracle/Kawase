-- Wallet & limits, editable (cards/automate-safety.md "Stay in control"): an allowance per token, the server's own
-- tighter cap on a signed allowance, temporary raises, the allowlist, limit changes with their approvals, and
-- practice ("would have") outcomes.
ALTER TABLE "grants" ADD COLUMN "token_address" text;
--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "policy_cap" numeric(78, 0);
--> statement-breakpoint
ALTER TABLE "grants" ADD COLUMN "boost" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "grants" SET "token_address" = "receipt"->>'token' WHERE "kind" = 'allowance' AND "token_address" IS NULL;
--> statement-breakpoint
CREATE INDEX "grants_allowance_token_idx" ON "grants" ("user_id", "network", lower("token_address")) WHERE "kind" = 'allowance';
--> statement-breakpoint
ALTER TABLE "contact_address_trust" ADD COLUMN "allowlisted_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE "safety_settings" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "allowlist_only" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "safety_settings_pk" ON "safety_settings" ("user_id", "network");
--> statement-breakpoint
CREATE TABLE "limit_changes" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "change" jsonb NOT NULL,
  "direction" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "typed_data" jsonb,
  "grant_id" uuid,
  "replaces_grant_id" uuid,
  "requested_via" text DEFAULT 'app' NOT NULL,
  "applied_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "limit_changes_user_idx" ON "limit_changes" ("user_id", "network", "created_at");
--> statement-breakpoint
CREATE TABLE "practice_runs" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "kind" text NOT NULL,
  "intent_id" uuid,
  "automation_id" uuid,
  "summary" jsonb NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "practice_runs_user_idx" ON "practice_runs" ("user_id", "network", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "practice_runs_intent_idx" ON "practice_runs" ("intent_id") WHERE "intent_id" IS NOT NULL;
