ALTER TABLE "resume_duplicate_match"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS "similarity" jsonb,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS "resume_duplicate_match_source_target_version_uq"
  ON "resume_duplicate_match" (
    "organization_id",
    "source_type",
    "source_id",
    "matched_source_type",
    "matched_source_id",
    "embedding_version"
  );

CREATE INDEX IF NOT EXISTS "resume_duplicate_match_org_status_idx"
  ON "resume_duplicate_match" ("organization_id", "status");
