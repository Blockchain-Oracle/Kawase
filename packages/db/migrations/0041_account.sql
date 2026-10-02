ALTER TABLE "devices" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "turnkey_public_key" text;
--> statement-breakpoint
CREATE TABLE "handle_holds" (
  "handle" text PRIMARY KEY NOT NULL,
  "held_until" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
