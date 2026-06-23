CREATE TABLE IF NOT EXISTS "organization_role" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "role" text NOT NULL,
  "permission" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_role_org_role_uq"
  ON "organization_role" ("organization_id", "role");

CREATE INDEX IF NOT EXISTS "organization_role_organization_idx"
  ON "organization_role" ("organization_id");
