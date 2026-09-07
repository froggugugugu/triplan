CREATE TABLE "csv_mapping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_key" text NOT NULL,
	"direction" text NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"include_header" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
