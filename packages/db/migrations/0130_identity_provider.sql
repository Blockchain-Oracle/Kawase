-- Privy replaces Turnkey (D41): provider-neutral identity columns, a 'privy' custody, and one ACTIVE wallet per person
-- (a Turnkey wallet replaced by the Privy one is kept, retired). The turnkey_* columns stay for the fallback build.
DO $$ BEGIN
  CREATE TYPE "public"."identity_provider" AS ENUM('turnkey', 'privy');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TYPE "public"."custody" ADD VALUE IF NOT EXISTS 'privy';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identity_provider" "identity_provider";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "identity_subject" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "identity_session_id" text;--> statement-breakpoint
UPDATE "users" SET "identity_provider" = 'turnkey', "identity_subject" = "turnkey_sub_organization_id"::text
  WHERE "turnkey_sub_organization_id" IS NOT NULL AND "identity_subject" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_identity_idx" ON "users" USING btree ("identity_provider","identity_subject") WHERE "users"."identity_subject" is not null;--> statement-breakpoint
DROP INDEX IF EXISTS "wallets_one_user_wallet_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_one_user_wallet_idx" ON "wallets" USING btree ("user_id") WHERE "wallets"."role" = 'user' and "wallets"."status" = 'active';
