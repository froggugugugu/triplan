ALTER TABLE "app_settings" ADD COLUMN "workdays_per_month" double precision;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "skill_review_cycle_months" integer;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "baseline_stale_threshold" double precision;