CREATE TYPE "public"."auth_provider" AS ENUM('local', 'azure_ad', 'google_workspace');--> statement-breakpoint
CREATE TYPE "public"."budget_adjustment_type" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."budget_breakdown_category" AS ENUM('project_personnel', 'project_expense', 'general_expense');--> statement-breakpoint
CREATE TYPE "public"."dependency_type" AS ENUM('FS', 'SS', 'FF', 'SF');--> statement-breakpoint
CREATE TYPE "public"."member_contract_type" AS ENUM('請負', '準委任', '派遣', '正社員');--> statement-breakpoint
CREATE TYPE "public"."personnel_plan_category" AS ENUM('personnel_internal', 'personnel_external', 'planned_internal', 'planned_external');--> statement-breakpoint
CREATE TYPE "public"."project_confidence" AS ENUM('S', 'A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('not_started', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."saas_contract_type" AS ENUM('annual', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."saas_payment_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."skill_evaluator_type" AS ENUM('self', 'manager');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('none', 'beginner', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TYPE "public"."sso_provider_type" AS ENUM('azure_ad', 'google_workspace');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "ai_usage_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"section_id" uuid,
	"provider_id" uuid,
	"fiscal_year" integer NOT NULL,
	"month" text NOT NULL,
	"budget_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"actual_amount" numeric(14, 2),
	CONSTRAINT "ai_usage_entries_unique" UNIQUE NULLS NOT DISTINCT("division_id","fiscal_year","month","section_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_member_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"month" text NOT NULL,
	"member_id" uuid NOT NULL,
	"provider_id" uuid,
	"monthly_budget" numeric(14, 2) DEFAULT 0 NOT NULL,
	"buffer_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"actual_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"buffer_actual_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_member_allocations_unique" UNIQUE NULLS NOT DISTINCT("division_id","fiscal_year","month","member_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plan" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"fiscal_year" integer NOT NULL,
	"estimated_unit_price" numeric(14, 2),
	"default_coefficient" numeric(6, 3),
	"project_coefficients" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exchange_rate_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"wbs_settings" jsonb,
	"metadata" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"monthly_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"adjustment_type" "budget_adjustment_type" DEFAULT 'increase' NOT NULL,
	"reason" text NOT NULL,
	"adjusted_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"category" "budget_breakdown_category" NOT NULL,
	"label" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"recorded_at" date NOT NULL,
	"estimate_amount" numeric(14, 2),
	"coefficient" numeric(6, 3),
	"project_id" uuid,
	"monthly_actuals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actual_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "division_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"initial_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "division_budgets_division_fiscal_year_unique" UNIQUE("division_id","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "efforts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"column_id" text NOT NULL,
	"value" numeric(10, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"section_id" uuid,
	"company_id" uuid,
	"contract_type" "member_contract_type",
	"role" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"tech_tag_ids" uuid[] DEFAULT '{}' NOT NULL,
	"start_date" date,
	"end_date" date,
	"unit_price_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contract_unit_price_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"fiscal_year" integer NOT NULL,
	"category" "personnel_plan_category" NOT NULL,
	"monthly_headcount" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"monthly_realized_headcount" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_plans_unique" UNIQUE("division_id","fiscal_year","category")
);
--> statement-breakpoint
CREATE TABLE "phase_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_phase_key" text NOT NULL,
	"to_phase_key" text NOT NULL,
	"dependency_type" "dependency_type" NOT NULL,
	CONSTRAINT "phase_dependencies_unique" UNIQUE("project_id","from_phase_key","to_phase_key")
);
--> statement-breakpoint
CREATE TABLE "project_progress_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"weekly_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_progress_entries_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"background" text,
	"purpose" text,
	"completion_criteria" text,
	"parent_id" uuid,
	"level" integer NOT NULL,
	"status" "project_status" DEFAULT 'not_started' NOT NULL,
	"confidence" "project_confidence",
	"completed" boolean DEFAULT false NOT NULL,
	"division_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "saas_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text,
	"division_id" uuid NOT NULL,
	"contract_type" "saas_contract_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"headcount" integer,
	"unit_price" numeric(14, 2),
	"amount_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthly_actuals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payment_cycle" "saas_payment_cycle" NOT NULL,
	"contract_start_date" date NOT NULL,
	"next_renewal_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_key" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "schedule_entries_project_phase_unique" UNIQUE("project_id","phase_key")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"division_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"tech_tag_id" uuid NOT NULL,
	"evaluator_type" "skill_evaluator_type" NOT NULL,
	"before_level" "skill_level" NOT NULL,
	"after_level" "skill_level" NOT NULL,
	"evaluated_at" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_roadmap_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"tech_tag_id" uuid NOT NULL,
	"target_level" "skill_level" NOT NULL,
	"target_date" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "sso_provider_type" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"client_id" text,
	"client_secret_encrypted" text,
	"tenant_id" text,
	"redirect_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sso_provider_configs_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "tech_tag_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tech_tag_sub_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tech_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"category_id" uuid NOT NULL,
	"sub_category_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"auth_provider" "auth_provider" DEFAULT 'local' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wbs_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_entries" ADD CONSTRAINT "ai_usage_entries_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_entries" ADD CONSTRAINT "ai_usage_entries_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_entries" ADD CONSTRAINT "ai_usage_entries_provider_id_ai_usage_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_usage_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_member_allocations" ADD CONSTRAINT "ai_usage_member_allocations_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_member_allocations" ADD CONSTRAINT "ai_usage_member_allocations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_member_allocations" ADD CONSTRAINT "ai_usage_member_allocations_provider_id_ai_usage_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_usage_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_providers" ADD CONSTRAINT "ai_usage_providers_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_task_id_projects_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_adjustments" ADD CONSTRAINT "budget_adjustments_budget_id_division_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."division_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_breakdowns" ADD CONSTRAINT "budget_breakdowns_budget_id_division_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."division_budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_breakdowns" ADD CONSTRAINT "budget_breakdowns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "division_budgets" ADD CONSTRAINT "division_budgets_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efforts" ADD CONSTRAINT "efforts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_plans" ADD CONSTRAINT "personnel_plans_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_dependencies" ADD CONSTRAINT "phase_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_progress_entries" ADD CONSTRAINT "project_progress_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_parent_id_projects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saas_contracts" ADD CONSTRAINT "saas_contracts_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_division_id_divisions_id_fk" FOREIGN KEY ("division_id") REFERENCES "public"."divisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evaluations" ADD CONSTRAINT "skill_evaluations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_evaluations" ADD CONSTRAINT "skill_evaluations_tech_tag_id_tech_tags_id_fk" FOREIGN KEY ("tech_tag_id") REFERENCES "public"."tech_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_roadmap_goals" ADD CONSTRAINT "skill_roadmap_goals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_roadmap_goals" ADD CONSTRAINT "skill_roadmap_goals_tech_tag_id_tech_tags_id_fk" FOREIGN KEY ("tech_tag_id") REFERENCES "public"."tech_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_tag_sub_categories" ADD CONSTRAINT "tech_tag_sub_categories_category_id_tech_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tech_tag_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_tags" ADD CONSTRAINT "tech_tags_category_id_tech_tag_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tech_tag_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_tags" ADD CONSTRAINT "tech_tags_sub_category_id_tech_tag_sub_categories_id_fk" FOREIGN KEY ("sub_category_id") REFERENCES "public"."tech_tag_sub_categories"("id") ON DELETE set null ON UPDATE no action;