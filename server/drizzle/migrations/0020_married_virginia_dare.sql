CREATE TABLE "external_tool_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text,
	"auth_email" text,
	"api_token_encrypted" text,
	"target_config" jsonb,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
