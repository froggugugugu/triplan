CREATE TABLE "schedule_settings_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_modified" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_settings_entries_project_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "wbs_column_settings_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"effort_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level_colors" jsonb,
	"last_modified" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wbs_column_settings_entries_project_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "schedule_settings_entries" ADD CONSTRAINT "schedule_settings_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wbs_column_settings_entries" ADD CONSTRAINT "wbs_column_settings_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;