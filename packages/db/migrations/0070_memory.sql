CREATE TABLE "memory_facts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "fact" text NOT NULL,
  "source_thread_id" uuid REFERENCES "threads"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "memory_facts_user_idx" ON "memory_facts" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "agent_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "memory_enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
