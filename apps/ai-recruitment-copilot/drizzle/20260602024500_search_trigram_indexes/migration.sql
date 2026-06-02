CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX "studio_interview_candidate_name_trgm_idx" ON "studio_interview" USING gin ("candidate_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "studio_interview_candidate_email_trgm_idx" ON "studio_interview" USING gin ("candidate_email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "studio_interview_candidate_phone_trgm_idx" ON "studio_interview" USING gin ("candidate_phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "studio_interview_resume_file_name_trgm_idx" ON "studio_interview" USING gin ("resume_file_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "studio_interview_target_role_trgm_idx" ON "studio_interview" USING gin ("target_role" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_round_label_trgm_idx" ON "studio_interview_schedule" USING gin ("round_label" gin_trgm_ops);
