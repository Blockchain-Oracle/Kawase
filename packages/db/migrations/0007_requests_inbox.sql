CREATE TYPE "public"."inbox_kind" AS ENUM('payment_received', 'request_paid', 'send_completed');--> statement-breakpoint
CREATE TYPE "public"."payment_request_status" AS ENUM('open', 'paid', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "chain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"asset" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"matched_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" "inbox_kind" NOT NULL,
	"params" jsonb NOT NULL,
	"request_id" uuid,
	"intent_id" uuid,
	"tx_hash" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"network" "network" NOT NULL,
	"stream" text NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexer_cursors_network_stream_pk" PRIMARY KEY("network","stream")
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"network" "network" NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"note" text,
	"pay_to" text NOT NULL,
	"status" "payment_request_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_tx_hash" text,
	"paid_by_address" text,
	"paid_intent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intents" ADD COLUMN "payment_request_id" uuid;--> statement-breakpoint
ALTER TABLE "chain_events" ADD CONSTRAINT "chain_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_log_idx" ON "chain_events" USING btree ("chain_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "chain_events_user_idx" ON "chain_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_dedupe_idx" ON "inbox_items" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "inbox_items_user_created_idx" ON "inbox_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_items_unread_idx" ON "inbox_items" USING btree ("user_id") WHERE "inbox_items"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_requests_token_idx" ON "payment_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "payment_requests_user_status_idx" ON "payment_requests" USING btree ("user_id","status");