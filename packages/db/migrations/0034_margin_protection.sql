ALTER TYPE "public"."grant_kind" ADD VALUE IF NOT EXISTS 'margin_protection';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'position_health';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'position_closed';--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN IF NOT EXISTS "take_profit" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN IF NOT EXISTS "stop_loss" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN IF NOT EXISTS "protection" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_health" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"level" text NOT NULL,
	"health" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_health_user_id_network_pk" PRIMARY KEY("user_id","network")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account_health" ADD CONSTRAINT "account_health_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
