DO $$
DECLARE
  column_existed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE
      table_schema = 'public'
      AND table_name = 'job_description'
      AND column_name = 'allow_cross_department_interviewers'
  )
  INTO column_existed;

  IF NOT column_existed THEN
    ALTER TABLE "job_description"
      ADD COLUMN "allow_cross_department_interviewers" boolean;

    UPDATE "job_description"
    SET "allow_cross_department_interviewers" = true;
  ELSE
    UPDATE "job_description"
    SET "allow_cross_department_interviewers" = false
    WHERE "allow_cross_department_interviewers" IS NULL;
  END IF;

  ALTER TABLE "job_description"
    ALTER COLUMN "allow_cross_department_interviewers" SET DEFAULT false,
    ALTER COLUMN "allow_cross_department_interviewers" SET NOT NULL;
END $$;
