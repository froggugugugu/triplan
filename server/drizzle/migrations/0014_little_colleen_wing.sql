CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"webhook_url_encrypted" text,
	"api_token_encrypted" text,
	"room_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"min_severity" text DEFAULT 'warning' NOT NULL,
	"notify_events" boolean DEFAULT true NOT NULL,
	"notify_digest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sent_at" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"ok" boolean NOT NULL,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;