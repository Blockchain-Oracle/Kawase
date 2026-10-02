CREATE TABLE IF NOT EXISTS "token_rules" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"access" text DEFAULT 'warned' NOT NULL,
	"unverified_per_trade_usd" integer DEFAULT 50 NOT NULL,
	"unverified_per_day_usd" integer DEFAULT 200 NOT NULL,
	"max_price_impact_bps" integer DEFAULT 500 NOT NULL,
	"pending" jsonb,
	"pending_expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_rules_user_id_network_pk" PRIMARY KEY("user_id","network")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "token_rules" ADD CONSTRAINT "token_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
