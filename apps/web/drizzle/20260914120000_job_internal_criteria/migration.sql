ALTER TABLE "job_description" ADD COLUMN IF NOT EXISTS "internal_criteria" text;
--> statement-breakpoint
ALTER TABLE "job_description_version" ADD COLUMN IF NOT EXISTS "internal_criteria" text;
