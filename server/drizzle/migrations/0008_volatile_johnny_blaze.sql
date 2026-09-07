CREATE TABLE "billing_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"planned_acceptance_date" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"requested_at" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"contract_amount_delta" numeric(14, 2) DEFAULT 0 NOT NULL,
	"contract_amount_delta_type" text DEFAULT 'increase' NOT NULL,
	"effort_delta_days" numeric(10, 2) DEFAULT 0 NOT NULL,
	"effort_delta_type" text DEFAULT 'increase' NOT NULL,
	"new_due_date" date,
	"note" text,
	"decided_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_type" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "master_due_date" date;--> statement-breakpoint
ALTER TABLE "billing_milestones" ADD CONSTRAINT "billing_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;