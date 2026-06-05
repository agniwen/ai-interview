-- One-time rollout script for the job-description cross-department interviewer flag.
-- Existing job descriptions keep their previous behavior by enabling the flag.
-- New rows default to false after this script runs.

ALTER TABLE "job_description"
  ADD COLUMN IF NOT EXISTS "allow_cross_department_interviewers" boolean;

UPDATE "job_description"
SET "allow_cross_department_interviewers" = true;

ALTER TABLE "job_description"
  ALTER COLUMN "allow_cross_department_interviewers" SET DEFAULT false,
  ALTER COLUMN "allow_cross_department_interviewers" SET NOT NULL;
