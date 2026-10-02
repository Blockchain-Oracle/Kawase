ALTER TYPE "public"."grant_kind" ADD VALUE IF NOT EXISTS 'marketplace';
--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('needs_consent', 'approved', 'paying', 'paid', 'failed_after_payment', 'failed', 'declined');
--> statement-breakpoint
CREATE TYPE "public"."purchase_rail" AS ENUM('gateway', 'eip3009');
--> statement-breakpoint
CREATE TYPE "public"."agent_move_kind" AS ENUM('top_up', 'deposit', 'return');
--> statement-breakpoint
CREATE TYPE "public"."agent_move_status" AS ENUM('pending', 'confirmed', 'failed');
--> statement-breakpoint
CREATE TABLE "marketplace_settings" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "daily_budget" numeric(78, 0) NOT NULL,
  "per_call_cap" numeric(78, 0) NOT NULL,
  "ask_first" boolean DEFAULT false NOT NULL,
  "allowed_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "blocked_sellers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_settings_pk" ON "marketplace_settings" ("user_id", "network");
--> statement-breakpoint
CREATE TABLE "marketplace_purchases" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "thread_id" uuid,
  "url" text NOT NULL,
  "method" text DEFAULT 'GET' NOT NULL,
  "request_hash" text NOT NULL,
  "provider_name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "pay_to" text,
  "amount" numeric(78, 0) NOT NULL,
  "rail" "purchase_rail",
  "status" "purchase_status" NOT NULL,
  "reason_code" text,
  "settlement" text,
  "authorization_nonce" text,
  "http_status" text,
  "content_type" text,
  "response_preview" text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketplace_purchases_user_created_idx" ON "marketplace_purchases" ("user_id", "network", "created_at");
--> statement-breakpoint
CREATE INDEX "marketplace_purchases_thread_idx" ON "marketplace_purchases" ("thread_id", "request_hash");
--> statement-breakpoint
CREATE TABLE "agent_wallet_moves" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "kind" "agent_move_kind" NOT NULL,
  "amount" numeric(78, 0) NOT NULL,
  "status" "agent_move_status" DEFAULT 'pending' NOT NULL,
  "tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_wallet_moves_user_created_idx" ON "agent_wallet_moves" ("user_id", "network", "created_at");
