ALTER TABLE "studio_interview_schedule"
ADD COLUMN "candidate_feedback_categories" jsonb,
ADD COLUMN "candidate_feedback_detail" text,
ADD COLUMN "candidate_feedback_submitted_at" timestamp with time zone;
