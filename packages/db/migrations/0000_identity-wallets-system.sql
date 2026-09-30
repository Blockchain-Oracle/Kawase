CREATE TYPE "public"."network" AS ENUM('mainnet', 'testnet');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('terms', 'mainnet_real_money', 'meme_risk', 'marketplace_risk', 'voice_retention');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('ios', 'android', 'web', 'desktop');--> statement-breakpoint
CREATE TYPE "public"."risk_mode" AS ENUM('careful', 'balanced', 'autonomous');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."custody" AS ENUM('turnkey', 'circle_dcw', 'external');--> statement-breakpoint
CREATE TYPE "public"."grant_kind" AS ENUM('allowance', 'automation');--> statement-breakpoint
CREATE TYPE "public"."grant_status" AS ENUM('pending', 'active', 'revoked', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."limit_kind" AS ENUM('per_tx', 'daily', 'weekly', 'approval_threshold', 'new_recipient_cooldown_s', 'new_recipient_cap', 'gas_float');--> statement-breakpoint
CREATE TYPE "public"."tx_attempt_status" AS ENUM('prepared', 'signature_pending', 'submitted', 'pending_chain', 'confirmed', 'reverted', 'dropped', 'not_sent', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tx_provider" AS ENUM('relayer', 'circle_dcw', 'user_wallet');--> statement-breakpoint
CREATE TYPE "public"."wallet_role" AS ENUM('user', 'marketplace', 'external', 'ops_redeemer', 'relayer', 'faucet_drip');--> statement-breakpoint
CREATE TYPE "public"."wallet_status" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TABLE "consents" (
	"user_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"version" text NOT NULL,
	"locale" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"installation_id" text NOT NULL,
	"expo_push_token" text,
	"app_version" text,
	"locale" text,
	"biometric_enrolled" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sign_in_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"turnkey_sub_organization_id" uuid,
	"turnkey_user_id" uuid,
	"is_anonymous" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"reply_language" text,
	"display_currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"active_network" "network" DEFAULT 'testnet' NOT NULL,
	"risk_mode" "risk_mode" DEFAULT 'balanced' NOT NULL,
	"practice_mode" boolean DEFAULT false NOT NULL,
	"paused_all_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_overrides" (
	"capability" text NOT NULL,
	"network" "network" NOT NULL,
	"enabled" boolean NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" "grant_kind" NOT NULL,
	"automation_id" uuid,
	"delegator_wallet_id" uuid NOT NULL,
	"delegate_address" text NOT NULL,
	"delegation" jsonb NOT NULL,
	"delegation_hash" text NOT NULL,
	"receipt" jsonb NOT NULL,
	"period_amount" numeric(78, 0) NOT NULL,
	"period_seconds" integer NOT NULL,
	"recipient_address" text,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "grant_status" DEFAULT 'pending' NOT NULL,
	"revoke_tx_attempt_id" uuid,
	"approval_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limits" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"kind" "limit_kind" NOT NULL,
	"value" numeric(78, 0) NOT NULL,
	"temp_value" numeric(78, 0),
	"temp_until" timestamp with time zone,
	"approval_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tx_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"intent_id" uuid,
	"occurrence_id" uuid,
	"network" "network" NOT NULL,
	"chain_id" integer NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"kind" text NOT NULL,
	"provider" "tx_provider" NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"provider_ref" text,
	"from_address" text NOT NULL,
	"to_address" text,
	"nonce" integer,
	"tx_hash" text,
	"status" "tx_attempt_status" DEFAULT 'prepared' NOT NULL,
	"receipt" jsonb,
	"error_code" text,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallet_setup" (
	"user_id" uuid NOT NULL,
	"network" "network" NOT NULL,
	"delegator_impl" text NOT NULL,
	"setup_tx_attempt_id" uuid,
	"setup_at" timestamp with time zone,
	"allowance_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"network" "network",
	"role" "wallet_role" NOT NULL,
	"custody" "custody" NOT NULL,
	"address" text NOT NULL,
	"provider_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "wallet_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_idempotency" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"actor" text NOT NULL,
	"actor_ref" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"network" "network",
	"intent_id" uuid,
	"policy_version" text,
	"checks" jsonb,
	"decision" text,
	"reason_code" text,
	"model_id" text,
	"tool_call_id" text,
	"device_id" uuid,
	"prev_hash" text,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"user_id" uuid,
	"network" "network",
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"dispatched_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_delegator_wallet_id_wallets_id_fk" FOREIGN KEY ("delegator_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limits" ADD CONSTRAINT "limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tx_attempts" ADD CONSTRAINT "tx_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallet_setup" ADD CONSTRAINT "user_wallet_setup_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_idempotency" ADD CONSTRAINT "api_idempotency_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_pk" ON "consents" USING btree ("user_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_installation_idx" ON "devices" USING btree ("user_id","installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_push_token_idx" ON "devices" USING btree ("expo_push_token") WHERE "devices"."expo_push_token" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email")) WHERE "users"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_turnkey_sub_organization_idx" ON "users" USING btree ("turnkey_sub_organization_id") WHERE "users"."turnkey_sub_organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "capability_overrides_pk" ON "capability_overrides" USING btree ("capability","network");--> statement-breakpoint
CREATE UNIQUE INDEX "grants_network_hash_idx" ON "grants" USING btree ("network","delegation_hash");--> statement-breakpoint
CREATE INDEX "grants_user_network_status_idx" ON "grants" USING btree ("user_id","network","status");--> statement-breakpoint
CREATE UNIQUE INDEX "limits_pk" ON "limits" USING btree ("user_id","network","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "tx_attempts_idempotency_idx" ON "tx_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "tx_attempts_intent_attempt_idx" ON "tx_attempts" USING btree ("intent_id","attempt_no") WHERE "tx_attempts"."intent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_attempts_chain_hash_idx" ON "tx_attempts" USING btree ("chain_id","tx_hash") WHERE "tx_attempts"."tx_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_attempts_from_nonce_idx" ON "tx_attempts" USING btree ("network",lower("from_address"),"nonce") WHERE "tx_attempts"."nonce" is not null and "tx_attempts"."provider" = 'user_wallet';--> statement-breakpoint
CREATE INDEX "tx_attempts_status_idx" ON "tx_attempts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_wallet_setup_pk" ON "user_wallet_setup" USING btree ("user_id","network");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_role_network_address_idx" ON "wallets" USING btree ("role","network",lower("address"));--> statement-breakpoint
CREATE INDEX "wallets_user_idx" ON "wallets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_user_wallet_idx" ON "wallets" USING btree ("user_id") WHERE "wallets"."role" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_pk" ON "api_idempotency" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "audit_log_user_created_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_idx" ON "outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_undispatched_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."dispatched_at" is null;