ALTER TABLE "spend_ledger" ALTER COLUMN "intent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_ledger" ADD COLUMN IF NOT EXISTS "payout_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_payout_id_payout_batches_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payout_batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "spend_ledger" ADD CONSTRAINT "spend_ledger_owner_check" CHECK ("intent_id" IS NOT NULL OR "payout_id" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spend_ledger_payout_idx" ON "spend_ledger" USING btree ("payout_id") WHERE "spend_ledger"."payout_id" is not null;
