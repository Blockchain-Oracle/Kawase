-- The Senryo look is light-first (decision D40): new people start light. Dark was the old Lime on Ink default, not a
-- choice anyone made, so everyone on it moves to light; Settings still offers dark and "match my phone".
ALTER TABLE "users" ALTER COLUMN "theme" SET DEFAULT 'light';
--> statement-breakpoint
UPDATE "users" SET "theme" = 'light' WHERE "theme" = 'dark';
