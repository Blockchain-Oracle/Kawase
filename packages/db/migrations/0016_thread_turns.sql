CREATE TABLE "thread_turns" (
  "thread_id" uuid NOT NULL REFERENCES "threads"("id") ON DELETE CASCADE,
  "id" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "input_hash" text NOT NULL,
  "surface" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('running', 'completed', 'interrupted', 'failed')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  PRIMARY KEY ("thread_id", "id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "thread_turns_running_idx" ON "thread_turns"("thread_id") WHERE "status" = 'running';
