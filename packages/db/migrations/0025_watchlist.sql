CREATE TABLE IF NOT EXISTS "watchlist" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_chain_id_token_address_pk" PRIMARY KEY("user_id","chain_id","token_address")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watchlist_user_network_idx" ON "watchlist" USING btree ("user_id","network");
