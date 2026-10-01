ALTER TABLE "users" ADD COLUMN "handle" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree (lower("handle")) WHERE "users"."handle" is not null;