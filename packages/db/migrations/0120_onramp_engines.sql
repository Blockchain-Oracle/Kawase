-- Buying inside Kawase (D42): a second engine (Coinbase Apple Pay, delivered to Base and then bridged to Arc as one
-- order), so an order now says which engine runs it, how it is paid, where the provider delivers, the provider's own
-- order id, the Base transfer that brought the money and the Bring-to-Arc intent that carries it on, plus the hash of
-- the key that lets Kawase's own buy page (a WebView with no sign-in) read and report just this one order.
ALTER TABLE "onramp_orders" ADD COLUMN "engine" text DEFAULT 'circle' NOT NULL;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "delivery_chain" text DEFAULT 'arc' NOT NULL;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "provider_order_id" text;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "delivery_tx" text;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "bridge_state" text;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "crosschain_intent_id" uuid;--> statement-breakpoint
ALTER TABLE "onramp_orders" ADD COLUMN "page_key_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "onramp_orders_provider_idx" ON "onramp_orders" USING btree ("engine","provider_order_id");
