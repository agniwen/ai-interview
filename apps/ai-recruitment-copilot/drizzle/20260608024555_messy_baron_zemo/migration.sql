ALTER TABLE "resume_upload_batch_item" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "resume_upload_batch_item" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "resume_upload_batch_item" ADD COLUMN "queue_job_id" text;--> statement-breakpoint
ALTER TABLE "resume_upload_batch_item" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "resume_parsed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "resume_parse_error" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "resume_parse_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
CREATE INDEX "studio_interview_resume_parse_status_idx" ON "studio_interview" ("resume_parse_status");
