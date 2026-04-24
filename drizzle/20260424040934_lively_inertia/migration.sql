ALTER TABLE "interview_conversation" ADD COLUMN "summary_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "summary_error" text;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "summary_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "summary_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX "interview_conversation_summary_status_idx" ON "interview_conversation" ("summary_status");