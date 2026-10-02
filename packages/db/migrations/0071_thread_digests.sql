CREATE TABLE "thread_digests" (
  "thread_id" uuid PRIMARY KEY NOT NULL REFERENCES "threads"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "through_message_id" text NOT NULL,
  "folded" integer NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
