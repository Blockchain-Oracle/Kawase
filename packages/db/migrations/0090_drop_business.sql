-- Business is removed (decision D39): the business profile, invoices and batch payouts. Old migrations stay as they are.
-- The spend ledger's link to a payout goes first. Its rows stay, so a payout made in the last few days keeps counting
-- against the person's limits until it ages out; "intent_id" stays nullable for them.
ALTER TABLE "spend_ledger" DROP CONSTRAINT IF EXISTS "spend_ledger_owner_check";
--> statement-breakpoint
ALTER TABLE "spend_ledger" DROP CONSTRAINT IF EXISTS "spend_ledger_payout_id_payout_batches_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "spend_ledger_payout_idx";
--> statement-breakpoint
ALTER TABLE "spend_ledger" DROP COLUMN IF EXISTS "payout_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "payout_batches";
--> statement-breakpoint
DROP TABLE IF EXISTS "invoices";
--> statement-breakpoint
DROP TABLE IF EXISTS "business_profiles";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."payout_status";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."invoice_status";
--> statement-breakpoint
-- Invoice reminders in the inbox (their push deliveries go with them). The enum values "invoice_due" and
-- "invoice_overdue" stay: Postgres cannot drop an enum value, and nothing writes them any more. (Enum columns are
-- compared as text below: the migrator runs every migration in one transaction, and Postgres refuses to use an enum
-- value that an earlier migration of the same run added, as 0045 and 0061 did.)
DELETE FROM "inbox_items" WHERE "kind"::text IN ('invoice_due', 'invoice_overdue');
--> statement-breakpoint
-- Payroll was an automation kind. A payroll that is still waiting or running is cancelled so nothing is left active that
-- can no longer run (a grant already signed on chain only ever allowed Kawase to pay that one person, and expires by
-- itself). The enum value "payroll" stays, unused, for the same reason as above.
UPDATE "automations" SET "status" = 'canceled', "next_run_at" = NULL WHERE "kind"::text = 'payroll' AND "status" IN ('draft', 'active', 'paused');
--> statement-breakpoint
-- Their steps still waiting for the person, and their runs still in flight, end as well.
UPDATE "attention_items" SET "status" = 'expired', "updated_at" = now() WHERE "status" = 'pending' AND "automation_id" IN (SELECT "id" FROM "automations" WHERE "kind"::text = 'payroll');
--> statement-breakpoint
UPDATE "automation_runs" SET "status" = 'skipped', "reason" = 'RUN_INTERRUPTED', "updated_at" = now() WHERE "status"::text IN ('executing', 'pending', 'needs_you') AND "automation_id" IN (SELECT "id" FROM "automations" WHERE "kind"::text = 'payroll');
