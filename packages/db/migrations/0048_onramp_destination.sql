-- Buy with Apple Pay straight into the agent wallet (B2-2): where an onramp order lands, and the block it started at
-- (an agent wallet has no incoming-watcher rows, so its arrival is read from USDC Transfer logs from that block).
ALTER TABLE "onramp_orders" ADD COLUMN "destination_kind" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "from_block" numeric(78, 0);
