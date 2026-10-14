CREATE TABLE IF NOT EXISTS "budget_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"proposal_id" uuid NOT NULL,
	"budget_id" uuid,
	"purpose" text NOT NULL,
	"subject" text NOT NULL,
	"delegation" jsonb NOT NULL,
	"delegation_hash" text NOT NULL,
	"nonce" numeric(78, 0) NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_grants" ADD CONSTRAINT "budget_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "budget_grants" ADD CONSTRAINT "budget_grants_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_grants_user_status_idx" ON "budget_grants" USING btree ("user_id","network","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_grants_proposal_idx" ON "budget_grants" USING btree ("proposal_id");
