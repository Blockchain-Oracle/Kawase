ALTER TABLE "tx_attempts" ADD COLUMN IF NOT EXISTS "gas_cost" numeric(78, 0);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tx_attempts_relayer_created_idx" ON "tx_attempts" USING btree ("network","created_at") WHERE "tx_attempts"."provider" = 'relayer';
