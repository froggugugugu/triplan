CREATE TABLE "actuals_import_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_at" text NOT NULL,
	"file_name" text NOT NULL,
	"target_months" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"skipped_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "monthly_actuals_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"confirmed_at" text NOT NULL,
	CONSTRAINT "monthly_actuals_confirmations_month_unique" UNIQUE("month")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "hours_per_day" double precision;