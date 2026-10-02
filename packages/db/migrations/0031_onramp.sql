CREATE TABLE "onramp_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"surface" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"reason" text,
	"asset" text NOT NULL,
	"fiat_amount" text,
	"fiat_currency" text,
	"trace_id" text,
	"then_token" text,
	"destination" text NOT NULL,
	"received" numeric(78, 0),
	"received_tx" text,
	"received_log_index" text,
	"settled_at" timestamp with time zone,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD CONSTRAINT "onramp_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onramp_orders_user_idx" ON "onramp_orders" USING btree ("user_id","network","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onramp_orders_received_idx" ON "onramp_orders" USING btree ("received_tx","received_log_index");
