CREATE TYPE "public"."token_visibility" AS ENUM('auto', 'shown', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."wallet_token_source" AS ENUM('transfer', 'backfill', 'balance');--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_usd" double precision NOT NULL,
	CONSTRAINT "portfolio_snapshots_user_id_network_taken_at_pk" PRIMARY KEY("user_id","network","taken_at")
);
--> statement-breakpoint
CREATE TABLE "token_metadata" (
	"chain_id" integer NOT NULL,
	"address" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"decimals" integer NOT NULL,
	"underlying" text,
	"broken" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_metadata_chain_id_address_pk" PRIMARY KEY("chain_id","address")
);
--> statement-breakpoint
CREATE TABLE "wallet_tokens" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"chain_id" integer NOT NULL,
	"token_address" text NOT NULL,
	"wallet_address" text NOT NULL,
	"source" "wallet_token_source" NOT NULL,
	"first_block" bigint,
	"last_block" bigint,
	"visibility" "token_visibility" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_tokens_user_id_chain_id_token_address_pk" PRIMARY KEY("user_id","chain_id","token_address")
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_tokens" ADD CONSTRAINT "wallet_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_tokens_user_network_idx" ON "wallet_tokens" USING btree ("user_id","network");
