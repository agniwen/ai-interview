ALTER TABLE "resume_pool_item"
  ADD COLUMN IF NOT EXISTS "source_channel" text;

CREATE TABLE IF NOT EXISTS "referral_link" (
  "id" text PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "job_description_id" text NOT NULL REFERENCES "job_description"("id") ON DELETE cascade,
  "created_by" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "disabled_at" timestamp with time zone,
  "disabled_by" text REFERENCES "user"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "referral_link_org_jd_creator_idx"
  ON "referral_link" ("organization_id", "job_description_id", "created_by", "disabled_at");

CREATE INDEX IF NOT EXISTS "referral_link_org_idx"
  ON "referral_link" ("organization_id", "disabled_at");
