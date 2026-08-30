CREATE TABLE IF NOT EXISTS "recruiting_group" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "organization_id" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "recruiting_group_member" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "group_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  CONSTRAINT "recruiting_group_member_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recruiting_group_created_by_user_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group"
      ADD CONSTRAINT "recruiting_group_created_by_user_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recruiting_group_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group"
      ADD CONSTRAINT "recruiting_group_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recruiting_group_member_group_id_recruiting_group_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      ADD CONSTRAINT "recruiting_group_member_group_id_recruiting_group_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."recruiting_group"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recruiting_group_member_organization_id_organization_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      ADD CONSTRAINT "recruiting_group_member_organization_id_organization_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recruiting_group_member_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "recruiting_group_member"
      ADD CONSTRAINT "recruiting_group_member_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "recruiting_group_org_name_uq"
  ON "recruiting_group" USING btree ("organization_id","name");

CREATE INDEX IF NOT EXISTS "recruiting_group_org_idx"
  ON "recruiting_group" USING btree ("organization_id");

CREATE INDEX IF NOT EXISTS "recruiting_group_member_group_idx"
  ON "recruiting_group_member" USING btree ("group_id");
