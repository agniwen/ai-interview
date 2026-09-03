ALTER TABLE "studio_interview"
ADD COLUMN "resume_evaluation_status" text;

ALTER TABLE "studio_interview"
ADD CONSTRAINT "studio_interview_resume_evaluation_status_check"
CHECK (
  "resume_evaluation_status" IS NULL
  OR "resume_evaluation_status" IN ('pass', 'fail')
);
