CREATE TABLE "member_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"desired_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"desired_tech_tag_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consented_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_preferences_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "org_design_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"teams" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_preferences" ADD CONSTRAINT "member_preferences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;