CREATE TABLE IF NOT EXISTS "blocks" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "blocked_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "address" text,
  "label" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "blocks_one_target" CHECK (("blocked_user_id" IS NULL) <> ("address" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_user_blocked_user_idx" ON "blocks" USING btree ("user_id", "blocked_user_id") WHERE "blocked_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_user_address_idx" ON "blocks" USING btree ("user_id", "address") WHERE "address" IS NOT NULL;
