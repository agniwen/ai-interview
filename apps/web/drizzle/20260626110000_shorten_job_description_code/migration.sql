ALTER TABLE "global_config"
  ALTER COLUMN "job_code_prefix" SET DEFAULT 'AUR';

UPDATE "global_config"
SET "job_code_prefix" = 'AUR'
WHERE "job_code_prefix" IS DISTINCT FROM 'AUR';

WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") - 1 AS idx
  FROM "job_description"
  WHERE "code" IS NOT NULL
),
encoded AS (
  SELECT
    "id",
    'AUR' ||
      substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ((idx / 46656)::int % 36) + 1, 1) ||
      substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ((idx / 1296)::int % 36) + 1, 1) ||
      substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ((idx / 36)::int % 36) + 1, 1) ||
      substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (idx::int % 36) + 1, 1) AS code
  FROM ranked
)
UPDATE "job_description"
SET "code" = encoded.code
FROM encoded
WHERE "job_description"."id" = encoded."id";
