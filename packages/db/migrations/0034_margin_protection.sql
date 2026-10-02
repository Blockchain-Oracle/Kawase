ALTER TYPE "public"."grant_kind" ADD VALUE 'margin_protection';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE 'position_health';--> statement-breakpoint
ALTER TYPE "public"."inbox_kind" ADD VALUE 'position_closed';--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN "take_profit" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN "stop_loss" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "margin_positions" ADD COLUMN "protection" text;--> statement-breakpoint
CREATE TABLE "account_health" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"level" text NOT NULL,
	"health" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_health_user_id_network_pk" PRIMARY KEY("user_id","network")
);
--> statement-breakpoint
ALTER TABLE "account_health" ADD CONSTRAINT "account_health_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
