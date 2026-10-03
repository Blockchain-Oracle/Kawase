DROP INDEX IF EXISTS "tx_attempts_chain_hash_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tx_attempts_chain_hash_intent_idx" ON "tx_attempts" USING btree ("chain_id","tx_hash",coalesce("intent_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "tx_attempts"."tx_hash" is not null;
