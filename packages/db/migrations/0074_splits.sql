CREATE TYPE "public"."split_status" AS ENUM('open', 'settled', 'canceled');
--> statement-breakpoint
CREATE TABLE "splits" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "title" text NOT NULL,
  "asset" text NOT NULL,
  "total" numeric(78, 0) NOT NULL,
  "my_share" numeric(78, 0),
  "status" "split_status" DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "splits_user_created_idx" ON "splits" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "split_shares" (
  "id" uuid PRIMARY KEY NOT NULL,
  "split_id" uuid NOT NULL REFERENCES "splits"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "name" text NOT NULL,
  "handle" text,
  "amount" numeric(78, 0) NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "payment_requests"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "split_shares_split_idx" ON "split_shares" USING btree ("split_id", "seq");
