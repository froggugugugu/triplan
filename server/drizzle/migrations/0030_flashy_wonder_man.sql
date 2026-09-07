CREATE TYPE "public"."estimate_method" AS ENUM('function_point', 'wbs', 'manual', 'actual');--> statement-breakpoint
CREATE TYPE "public"."estimate_stage" AS ENUM('initial_concept', 'product_definition', 'requirements_complete', 'ui_design_complete', 'detailed_design_complete', 'completed');--> statement-breakpoint
CREATE TABLE "estimate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"stage" "estimate_stage" NOT NULL,
	"method" "estimate_method" NOT NULL,
	"label" text NOT NULL,
	"taken_at" text NOT NULL,
	"effort_days" numeric(12, 2) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"basis" jsonb NOT NULL,
	"fp" jsonb,
	"wbs" jsonb,
	"change_request_id" uuid,
	"note" text,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estimate_snapshots_project_id_version_unique" UNIQUE("project_id","version")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "hours_per_function_point" double precision;--> statement-breakpoint
ALTER TABLE "estimate_snapshots" ADD CONSTRAINT "estimate_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;