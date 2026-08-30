ALTER TABLE "job_description"
  ADD COLUMN IF NOT EXISTS "code" text;

ALTER TABLE "global_config"
  ADD COLUMN IF NOT EXISTS "job_code_prefix" text DEFAULT 'AUR';

UPDATE "global_config"
SET "job_code_prefix" = 'AUR'
WHERE "job_code_prefix" IS NULL OR btrim("job_code_prefix") = '';

ALTER TABLE "global_config"
  ALTER COLUMN "job_code_prefix" SET DEFAULT 'AUR',
  ALTER COLUMN "job_code_prefix" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "job_description_org_code_uq"
  ON "job_description" ("organization_id", "code")
  WHERE "code" IS NOT NULL;
