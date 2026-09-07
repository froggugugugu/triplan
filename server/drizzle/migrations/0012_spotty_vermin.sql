CREATE TABLE "monthly_close_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"occurred_at" text NOT NULL,
	"actor_name" text
);
