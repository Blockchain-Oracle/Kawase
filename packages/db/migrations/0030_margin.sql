ALTER TYPE "public"."intent_kind" ADD VALUE 'margin';--> statement-breakpoint
CREATE TABLE "margin_positions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"venue" text NOT NULL,
	"market" text NOT NULL,
	"asset" text NOT NULL,
	"side" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"collateral" numeric(78, 0) NOT NULL,
	"debt" numeric(78, 0) NOT NULL,
	"margin" numeric(78, 0) NOT NULL,
	"entry_price" numeric(78, 0) NOT NULL,
	"returned" numeric(78, 0) DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "margin_positions" ADD CONSTRAINT "margin_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "margin_positions_user_idx" ON "margin_positions" USING btree ("user_id","network","status");--> statement-breakpoint
CREATE UNIQUE INDEX "margin_positions_open_idx" ON "margin_positions" USING btree ("user_id","network","market","side") WHERE "margin_positions"."status" = 'open';
