CREATE TYPE "public"."address_source" AS ENUM('typed', 'pasted', 'scanned', 'handle', 'received', 'agent');--> statement-breakpoint
CREATE TYPE "public"."contact_address_status" AS ENUM('pending_cooldown', 'active', 'retired', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('person', 'business');--> statement-breakpoint
CREATE TYPE "public"."approval_route" AS ENUM('allowance', 'wallet_signature');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending_signature', 'approved', 'consumed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."intent_kind" AS ENUM('send');--> statement-breakpoint
CREATE TYPE "public"."intent_state" AS ENUM('submitted', 'working', 'input_required', 'auth_required', 'ready_for_approval', 'approved', 'executing', 'completed', 'failed', 'rejected', 'canceled', 'expired', 'unknown_outcome');--> statement-breakpoint
CREATE TYPE "public"."spend_state" AS ENUM('reserved', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."surface" AS ENUM('app', 'chat', 'voice', 'automation');--> statement-breakpoint
CREATE TABLE "contact_address_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"old_address_id" uuid,
	"new_address_id" uuid,
	"requested_by" text NOT NULL,
	"cooldown_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_address_trust" (
	"contact_address_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"first_paid_at" timestamp with time zone,
	"last_paid_at" timestamp with time zone,
	"payment_count" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_method" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_address_trust_contact_address_id_network_pk" PRIMARY KEY("contact_address_id","network")
);
--> statement-breakpoint
CREATE TABLE "contact_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_key" text DEFAULT 'arc' NOT NULL,
	"address" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_preferred" boolean DEFAULT true NOT NULL,
	"source" "address_source" NOT NULL,
	"source_detail" text,
	"status" "contact_address_status" DEFAULT 'active' NOT NULL,
	"supersedes_id" uuid,
	"activates_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"handle" text,
	"kind" "contact_kind" DEFAULT 'person' NOT NULL,
	"label" text,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intent_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"draft_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"route" "approval_route" NOT NULL,
	"unsigned_transaction" jsonb,
	"signer_address" text,
	"device_id" uuid,
	"status" "approval_status" NOT NULL,
	"decided_via_surface" "surface" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intent_drafts" (
	"intent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"draft_hash" text,
	"policy_report" jsonb NOT NULL,
	"route" "approval_route",
	"created_by" text NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intent_drafts_intent_id_version_pk" PRIMARY KEY("intent_id","version")
);
--> statement-breakpoint
CREATE TABLE "intents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid,
	"network" "network" NOT NULL,
	"kind" "intent_kind" NOT NULL,
	"origin_surface" "surface" NOT NULL,
	"state" "intent_state" DEFAULT 'submitted' NOT NULL,
	"current_draft_version" integer DEFAULT 0 NOT NULL,
	"request" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"intent_id" uuid NOT NULL,
	"category" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(78, 0) NOT NULL,
	"state" "spend_state" DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_address_events" ADD CONSTRAINT "contact_address_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_address_events" ADD CONSTRAINT "contact_address_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_address_trust" ADD CONSTRAINT "contact_address_trust_contact_address_id_contact_addresses_id_fk" FOREIGN KEY ("contact_address_id") REFERENCES "public"."contact_addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_address_trust" ADD CONSTRAINT "contact_address_trust_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_drafts" ADD CONSTRAINT "intent_drafts_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intents" ADD CONSTRAINT "intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_intent_id_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_address_events_contact_idx" ON "contact_address_events" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_addresses_contact_address_idx" ON "contact_addresses" USING btree ("contact_id","chain_key",lower("address"));--> statement-breakpoint
CREATE INDEX "contact_addresses_user_address_idx" ON "contact_addresses" USING btree ("user_id",lower("address"));--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_user_name_idx" ON "contacts" USING btree ("user_id",lower("display_name")) WHERE "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "contacts_user_idx" ON "contacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_intent_version_idx" ON "approvals" USING btree ("intent_id","draft_version") WHERE "approvals"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "intents_user_state_idx" ON "intents" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "intents_user_created_idx" ON "intents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spend_ledger_intent_category_idx" ON "spend_ledger" USING btree ("intent_id","category");--> statement-breakpoint
CREATE INDEX "spend_ledger_user_network_created_idx" ON "spend_ledger" USING btree ("user_id","network","created_at");