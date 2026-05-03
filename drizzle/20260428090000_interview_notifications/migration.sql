CREATE TABLE "interview_notification" (
	"conversation_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"feishu_message_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"interview_record_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"recipient_open_id" text NOT NULL,
	"recipient_user_id" text,
	"sent_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "interview_notification_record_idx" ON "interview_notification" ("interview_record_id");--> statement-breakpoint
CREATE INDEX "interview_notification_recipient_idx" ON "interview_notification" ("recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_notification_once_uq" ON "interview_notification" ("interview_record_id","conversation_id","type","recipient_user_id","provider_id");--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_conversation_id_interview_conversation_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "interview_conversation"("conversation_id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_interview_record_id_studio_interview_id_fk" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "user"("id") ON DELETE SET NULL;
