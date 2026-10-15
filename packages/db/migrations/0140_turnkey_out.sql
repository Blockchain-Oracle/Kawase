-- Turnkey is gone (D41 finished, 10-15): its columns and enum values go, and two tables take over what it did that
-- Privy does not do for us: refusing a signed-out device's Privy session, and the web's emailed approval code.
-- Production was reset before this ran, so no row holds a Turnkey value; the casts below would fail loudly if one did.
DROP INDEX IF EXISTS "users_turnkey_sub_organization_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "turnkey_sub_organization_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "turnkey_user_id";--> statement-breakpoint
ALTER TABLE "devices" DROP COLUMN IF EXISTS "turnkey_public_key";--> statement-breakpoint
ALTER TYPE "public"."identity_provider" RENAME TO "identity_provider_old";--> statement-breakpoint
CREATE TYPE "public"."identity_provider" AS ENUM('privy');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "identity_provider" TYPE "public"."identity_provider" USING "identity_provider"::text::"public"."identity_provider";--> statement-breakpoint
DROP TYPE "public"."identity_provider_old";--> statement-breakpoint
ALTER TYPE "public"."custody" RENAME TO "custody_old";--> statement-breakpoint
CREATE TYPE "public"."custody" AS ENUM('circle_dcw', 'external', 'privy');--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "custody" TYPE "public"."custody" USING "custody"::text::"public"."custody";--> statement-breakpoint
DROP TYPE "public"."custody_old";--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revoked_identity_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revoked_identity_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_codes_user_idx" ON "approval_codes" USING btree ("user_id");
