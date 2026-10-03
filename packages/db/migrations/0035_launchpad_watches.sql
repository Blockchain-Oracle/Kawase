ALTER TYPE "public"."inbox_kind" ADD VALUE IF NOT EXISTS 'token_graduated';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "launchpad_watches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"token" text NOT NULL,
	"symbol" text NOT NULL,
	"launchpad" text NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "launchpad_watches" ADD CONSTRAINT "launchpad_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "launchpad_watches_user_token_idx" ON "launchpad_watches" USING btree ("user_id","network","token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "launchpad_watches_open_idx" ON "launchpad_watches" USING btree ("notified_at");
