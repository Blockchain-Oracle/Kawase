DO $$ BEGIN
  CREATE TYPE "public"."place_kind" AS ENUM('exchange', 'wallet');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" "place_kind" NOT NULL,
	"label" text NOT NULL,
	"brand" text,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "places" ADD CONSTRAINT "places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "places_user_where_idx" ON "places" USING btree ("user_id","network","chain","address") WHERE "places"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_user_idx" ON "places" USING btree ("user_id");
