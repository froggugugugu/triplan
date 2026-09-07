ALTER TYPE "public"."user_role" ADD VALUE 'manager';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'partner';--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phase" text,
	"description" text,
	"content" text NOT NULL,
	"source_refs" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
