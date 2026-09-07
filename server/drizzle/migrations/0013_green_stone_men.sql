CREATE TABLE "task_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"synced_at" text NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"completed_count" integer NOT NULL,
	"reopened_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"skipped_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "external_task_id" text;