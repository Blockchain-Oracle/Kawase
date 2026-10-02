ALTER TABLE "thread_turns" ADD COLUMN "lease_until" timestamp with time zone DEFAULT now() + interval '90 seconds' NOT NULL;
