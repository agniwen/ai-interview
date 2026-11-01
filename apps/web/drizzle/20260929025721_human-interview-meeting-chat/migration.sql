CREATE TABLE "human_interview_meeting_chat_message" (
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"meeting_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"participant_identity" text NOT NULL,
	"sender_name" text NOT NULL,
	CONSTRAINT "human_interview_meeting_chat_message_content_check" CHECK (length(trim("content")) > 0 AND length("content") <= 2000)
);
--> statement-breakpoint
CREATE INDEX "human_interview_meeting_chat_message_meeting_idx" ON "human_interview_meeting_chat_message" ("meeting_id","created_at");--> statement-breakpoint
ALTER TABLE "human_interview_meeting_chat_message" ADD CONSTRAINT "human_interview_meeting_chat_message_meeting_id_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "human_interview_meeting"("id","organization_id") ON DELETE CASCADE;