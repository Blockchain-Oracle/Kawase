CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"chain_id" integer NOT NULL,
	"wallet" text NOT NULL,
	"weekly_cap" numeric(78, 0) NOT NULL,
	"per_action_cap" numeric(78, 0) NOT NULL,
	"categories" text[] NOT NULL,
	"venues" text[] NOT NULL,
	"issued_at" integer NOT NULL,
	"version" integer NOT NULL,
	"signature" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_spend" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"budget_id" uuid NOT NULL,
	"intent_id" uuid,
	"category" text NOT NULL,
	"venue" text NOT NULL,
	"amount_usd" numeric(78, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_leaf_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"intent_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" text NOT NULL,
	"draft_version" integer NOT NULL,
	"draft_hash" text NOT NULL,
	"steps" jsonb NOT NULL,
	"category" text NOT NULL,
	"venue" text NOT NULL,
	"amount_usd" numeric(78, 0) NOT NULL,
	"status" text DEFAULT 'pending_signature' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_spend" ADD CONSTRAINT "budget_spend_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_spend" ADD CONSTRAINT "budget_spend_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_spend" ADD CONSTRAINT "budget_spend_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_leaf_requests" ADD CONSTRAINT "budget_leaf_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_leaf_requests" ADD CONSTRAINT "budget_leaf_requests_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_active_idx" ON "budgets" USING btree ("user_id","network") WHERE "budgets"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_version_idx" ON "budgets" USING btree ("user_id","network","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_spend_week_idx" ON "budget_spend" USING btree ("user_id","network","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_spend_intent_idx" ON "budget_spend" USING btree ("intent_id") WHERE "budget_spend"."intent_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_leaf_requests_intent_idx" ON "budget_leaf_requests" USING btree ("intent_id");
