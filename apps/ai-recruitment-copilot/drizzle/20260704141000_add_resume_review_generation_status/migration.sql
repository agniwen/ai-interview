ALTER TABLE "studio_interview"
ADD COLUMN "resume_review_status" text NOT NULL DEFAULT 'idle',
ADD COLUMN "resume_review_error" text,
ADD COLUMN "resume_review_queued_at" timestamp with time zone,
ADD COLUMN "resume_review_generated_at" timestamp with time zone;

UPDATE "studio_interview"
SET
  "resume_review_status" = CASE
    WHEN "resume_review" IS NOT NULL THEN 'ready'
    ELSE 'idle'
  END,
  "resume_review_generated_at" = CASE
    WHEN "resume_review" IS NOT NULL THEN COALESCE("updated_at", now())
    ELSE NULL
  END;
