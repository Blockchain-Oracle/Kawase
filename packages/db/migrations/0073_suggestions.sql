ALTER TABLE "agent_preferences" ADD COLUMN "muted_suggestions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE TABLE "suggestion_dismissals" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "suggestion_id" text NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "suggestion_dismissals_pk" PRIMARY KEY ("user_id", "suggestion_id")
);
