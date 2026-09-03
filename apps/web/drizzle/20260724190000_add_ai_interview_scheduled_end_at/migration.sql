ALTER TABLE "studio_interview_schedule"
ADD COLUMN "scheduled_end_at" timestamp with time zone;

UPDATE "studio_interview_schedule"
SET "scheduled_end_at" = "scheduled_at" + INTERVAL '1 hour'
WHERE "scheduled_at" IS NOT NULL
  AND "scheduled_end_at" IS NULL;
