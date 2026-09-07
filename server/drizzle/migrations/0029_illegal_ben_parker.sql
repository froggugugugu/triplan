CREATE TYPE "public"."risk_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'realized', 'closed');--> statement-breakpoint
CREATE TABLE "risk_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"probability" "risk_level" NOT NULL,
	"impact" "risk_level" NOT NULL,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"response" text,
	"owner_member_id" uuid,
	"due_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_entries" ADD CONSTRAINT "risk_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;