ALTER TABLE "chat_attachment" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "resume_content_hash" text;--> statement-breakpoint
CREATE INDEX "chat_attachment_content_hash_idx" ON "chat_attachment" ("content_hash");--> statement-breakpoint
CREATE INDEX "studio_interview_resume_hash_idx" ON "studio_interview" ("resume_content_hash");