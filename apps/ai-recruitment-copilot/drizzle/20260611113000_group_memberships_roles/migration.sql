ALTER TABLE "recruiting_group"
  ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;

ALTER TABLE "recruiting_group_member"
  ADD COLUMN IF NOT EXISTS "id" text,
  ADD COLUMN IF NOT EXISTS "role" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "created_by" text;

UPDATE "recruiting_group_member" AS rgm
SET
  "id" = COALESCE(rgm."id", 'rgm_' || md5(rgm."organization_id" || ':' || rgm."group_id" || ':' || rgm."user_id")),
  "role" = COALESCE(
    rgm."role",
    CASE m."role"
      WHEN 'recruitingSupervisor' THEN 'recruitingSupervisor'
      WHEN 'recruitingLead' THEN 'recruitingLead'
      WHEN 'viewer' THEN 'viewer'
      ELSE 'hr'
    END
  )
FROM "member" AS m
WHERE
  m."organization_id" = rgm."organization_id"
  AND m."user_id" = rgm."user_id";

ALTER TABLE "recruiting_group_member"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "role" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recruiting_group_member_organization_id_user_id_pk'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      DROP CONSTRAINT "recruiting_group_member_organization_id_user_id_pk";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recruiting_group_member_pkey'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      ADD CONSTRAINT "recruiting_group_member_pkey" PRIMARY KEY ("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recruiting_group_member_created_by_user_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      ADD CONSTRAINT "recruiting_group_member_created_by_user_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "recruiting_group_org_default_uq"
  ON "recruiting_group" USING btree ("organization_id")
  WHERE "is_default" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "recruiting_group_member_org_group_user_uq"
  ON "recruiting_group_member" USING btree ("organization_id","group_id","user_id");

CREATE INDEX IF NOT EXISTS "recruiting_group_member_org_user_idx"
  ON "recruiting_group_member" USING btree ("organization_id","user_id");

CREATE INDEX IF NOT EXISTS "recruiting_group_member_org_group_role_user_idx"
  ON "recruiting_group_member" USING btree ("organization_id","group_id","role","user_id");

DROP INDEX IF EXISTS "recruiting_group_member_group_idx";

INSERT INTO "recruiting_group" (
  "created_at",
  "created_by",
  "id",
  "is_default",
  "name",
  "organization_id",
  "updated_at"
)
SELECT
  now(),
  owner_member."user_id",
  'rg_' || md5(org."id" || ':default_recruiting_group'),
  true,
  '默认招聘组',
  org."id",
  now()
FROM "organization" AS org
LEFT JOIN LATERAL (
  SELECT "user_id"
  FROM "member"
  WHERE "organization_id" = org."id" AND "role" = 'owner'
  ORDER BY "created_at" ASC
  LIMIT 1
) AS owner_member ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM "recruiting_group" AS existing
  WHERE existing."organization_id" = org."id" AND existing."is_default" = true
);

INSERT INTO "recruiting_group_member" (
  "created_at",
  "created_by",
  "group_id",
  "id",
  "organization_id",
  "role",
  "updated_at",
  "user_id"
)
SELECT
  now(),
  owner_member."user_id",
  default_group."id",
  'rgm_' || md5(default_group."organization_id" || ':' || default_group."id" || ':' || owner_member."user_id"),
  default_group."organization_id",
  'recruitingSupervisor',
  now(),
  owner_member."user_id"
FROM "recruiting_group" AS default_group
JOIN LATERAL (
  SELECT "user_id"
  FROM "member"
  WHERE "organization_id" = default_group."organization_id" AND "role" = 'owner'
  ORDER BY "created_at" ASC
  LIMIT 1
) AS owner_member ON true
WHERE default_group."is_default" = true
ON CONFLICT ("organization_id","group_id","user_id") DO NOTHING;

UPDATE "member"
SET "role" = 'member'
WHERE "role" IN ('recruitingSupervisor', 'recruitingLead', 'hr', 'viewer');
