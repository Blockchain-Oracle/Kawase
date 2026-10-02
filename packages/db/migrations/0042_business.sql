CREATE TYPE "public"."invoice_status" AS ENUM('open', 'partially_paid', 'paid', 'canceled');
--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('ready', 'submitted', 'confirmed', 'failed');
--> statement-breakpoint
CREATE TABLE "business_profiles" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "address" text,
  "tax_id" text,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "number" text NOT NULL,
  "request_id" uuid REFERENCES "payment_requests"("id") ON DELETE SET NULL,
  "client_name" text NOT NULL,
  "client_email" text,
  "asset" text NOT NULL,
  "line_items" jsonb NOT NULL,
  "total" numeric(78, 0) NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "memo_id" text NOT NULL,
  "status" "invoice_status" DEFAULT 'open' NOT NULL,
  "paid_amount" numeric(78, 0) DEFAULT 0 NOT NULL,
  "payments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_user_number_idx" ON "invoices" ("user_id", "number");
--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_memo_idx" ON "invoices" ("memo_id");
--> statement-breakpoint
CREATE INDEX "invoices_network_status_idx" ON "invoices" ("network", "status");
--> statement-breakpoint
CREATE TABLE "payout_batches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "asset" text NOT NULL,
  "lines" jsonb NOT NULL,
  "total" numeric(78, 0) NOT NULL,
  "status" "payout_status" DEFAULT 'ready' NOT NULL,
  "tx_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payout_batches_user_created_idx" ON "payout_batches" ("user_id", "created_at");
--> statement-breakpoint
CREATE TABLE "payrolls" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "network" "network" NOT NULL,
  "name" text NOT NULL,
  "automation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payrolls_user_idx" ON "payrolls" ("user_id");
