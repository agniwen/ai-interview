ALTER TABLE "job_description" ADD COLUMN "resume_screening_policy" jsonb;
ALTER TABLE "job_description" ADD COLUMN "resume_screening_policy_hash" text;
ALTER TABLE "job_description" ADD COLUMN "resume_screening_policy_version" integer DEFAULT 1 NOT NULL;

ALTER TABLE "studio_interview" ADD COLUMN "hr_resume_assessment" text;
ALTER TABLE "studio_interview" ADD COLUMN "hr_resume_assessment_updated_at" timestamp with time zone;
ALTER TABLE "studio_interview" ADD COLUMN "hr_resume_assessment_updated_by" text;
ALTER TABLE "studio_interview" ADD COLUMN "resume_screening_error" text;
ALTER TABLE "studio_interview" ADD COLUMN "resume_screening_evaluated_at" timestamp with time zone;
ALTER TABLE "studio_interview" ADD COLUMN "resume_screening_result" jsonb;
ALTER TABLE "studio_interview" ADD COLUMN "resume_screening_status" text DEFAULT 'idle' NOT NULL;

ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_hr_resume_assessment_updated_by_user_id_fkey" FOREIGN KEY ("hr_resume_assessment_updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
