ALTER TABLE "studio_human_interview_round_interviewer"
  ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "confirmed_schedule_version" integer,
  ADD COLUMN IF NOT EXISTS "decline_reason" text,
  ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_human_interview_round_interviewer_status_check'
  ) THEN
    ALTER TABLE "studio_human_interview_round_interviewer"
      ADD CONSTRAINT "studio_human_interview_round_interviewer_status_check"
        CHECK ("status" IN ('pending', 'confirmed', 'declined'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_human_interview_round_interviewer_confirmed_version_check'
  ) THEN
    ALTER TABLE "studio_human_interview_round_interviewer"
      ADD CONSTRAINT "studio_human_interview_round_interviewer_confirmed_version_check"
        CHECK ("confirmed_schedule_version" IS NULL OR "confirmed_schedule_version" > 0);
  END IF;
END $$;
