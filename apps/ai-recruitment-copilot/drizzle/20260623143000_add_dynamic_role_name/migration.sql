ALTER TABLE "organization_role"
  ADD COLUMN IF NOT EXISTS "name" text;

UPDATE "organization_role"
SET "name" = "role"
WHERE "name" IS NULL;

ALTER TABLE "organization_role"
  ALTER COLUMN "name" SET NOT NULL;
