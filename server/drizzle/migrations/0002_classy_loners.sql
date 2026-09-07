CREATE TYPE "public"."project_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_name" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "priority" "project_priority";