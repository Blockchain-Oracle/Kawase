CREATE TYPE "public"."faucet_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "faucet_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"address" text NOT NULL,
	"amounts" jsonb NOT NULL,
	"status" "faucet_status" NOT NULL,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faucet_claims" ADD CONSTRAINT "faucet_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "faucet_claims_user_created_idx" ON "faucet_claims" USING btree ("user_id","created_at");