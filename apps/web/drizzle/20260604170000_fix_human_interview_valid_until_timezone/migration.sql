DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'studio_human_interview_meeting'
      AND column_name = 'valid_until'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "studio_human_interview_meeting"
      ALTER COLUMN "valid_until" TYPE timestamp with time zone
      USING "valid_until" AT TIME ZONE 'UTC';
  END IF;
END $$;
