CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'email');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"inbox_item_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"target" text NOT NULL,
	"device_id" uuid,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_id" text,
	"error" text,
	"sending_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"receipt_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quiet_hours" jsonb;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_inbox_item_id_inbox_items_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_target_idx" ON "notification_deliveries" USING btree ("inbox_item_id","channel","target");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queued_idx" ON "notification_deliveries" USING btree ("next_attempt_at") WHERE "notification_deliveries"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "notification_deliveries_receipt_idx" ON "notification_deliveries" USING btree ("sent_at") WHERE "notification_deliveries"."status" = 'sent' and "notification_deliveries"."channel" = 'push';