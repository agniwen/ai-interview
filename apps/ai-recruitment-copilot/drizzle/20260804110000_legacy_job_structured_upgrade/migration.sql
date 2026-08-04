ALTER TABLE "job_description"
ADD COLUMN "evaluation_upgraded_at" timestamp with time zone;

ALTER TABLE "job_description"
ADD COLUMN "evaluation_upgraded_by" text;

ALTER TABLE "job_description"
ADD CONSTRAINT "job_description_evaluation_upgraded_by_user_id_fk"
FOREIGN KEY ("evaluation_upgraded_by") REFERENCES "user"("id")
ON DELETE SET NULL;

CREATE TABLE "job_description_evaluation_upgrade_draft" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "job_description_id" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "prompt" text NOT NULL,
  "structured_config" jsonb NOT NULL,
  "blueprint_preview" jsonb,
  "blueprint_preview_input_hash" text,
  "blueprint_preview_hash" text,
  "blueprint_preview_generated_at" timestamp with time zone,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_description_evaluation_upgrade_draft_job_uq" UNIQUE("job_description_id"),
  CONSTRAINT "job_description_evaluation_upgrade_draft_version_check" CHECK ("version" > 0),
  CONSTRAINT "job_description_evaluation_upgrade_draft_preview_check" CHECK (
    (
      "blueprint_preview" IS NULL
      AND "blueprint_preview_input_hash" IS NULL
      AND "blueprint_preview_hash" IS NULL
      AND "blueprint_preview_generated_at" IS NULL
    ) OR (
      "blueprint_preview" IS NOT NULL
      AND "blueprint_preview_input_hash" IS NOT NULL
      AND "blueprint_preview_hash" IS NOT NULL
      AND "blueprint_preview_generated_at" IS NOT NULL
    )
  )
);

ALTER TABLE "job_description_evaluation_upgrade_draft"
ADD CONSTRAINT "job_description_evaluation_upgrade_draft_organization_id_organization_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;

ALTER TABLE "job_description_evaluation_upgrade_draft"
ADD CONSTRAINT "job_description_evaluation_upgrade_draft_job_description_id_job_description_id_fk"
FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;

ALTER TABLE "job_description_evaluation_upgrade_draft"
ADD CONSTRAINT "job_description_evaluation_upgrade_draft_created_by_user_id_fk"
FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;

ALTER TABLE "job_description_evaluation_upgrade_draft"
ADD CONSTRAINT "job_description_evaluation_upgrade_draft_updated_by_user_id_fk"
FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;

CREATE INDEX "job_description_evaluation_upgrade_draft_org_idx"
ON "job_description_evaluation_upgrade_draft" ("organization_id");

CREATE TABLE "job_description_evaluation_upgrade_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "job_description_id" text NOT NULL,
  "draft_version" integer NOT NULL,
  "legacy_snapshot" jsonb NOT NULL,
  "prompt" text NOT NULL,
  "structured_config" jsonb NOT NULL,
  "blueprint" jsonb NOT NULL,
  "blueprint_hash" text NOT NULL,
  "blueprint_schema_version" integer NOT NULL,
  "deduction_rule_set_version" integer NOT NULL,
  "upgraded_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "job_description_evaluation_upgrade_audit"
ADD CONSTRAINT "job_description_evaluation_upgrade_audit_organization_id_organization_id_fk"
FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;

ALTER TABLE "job_description_evaluation_upgrade_audit"
ADD CONSTRAINT "job_description_evaluation_upgrade_audit_job_description_id_job_description_id_fk"
FOREIGN KEY ("job_description_id") REFERENCES "job_description"("id") ON DELETE CASCADE;

ALTER TABLE "job_description_evaluation_upgrade_audit"
ADD CONSTRAINT "job_description_evaluation_upgrade_audit_upgraded_by_user_id_fk"
FOREIGN KEY ("upgraded_by") REFERENCES "user"("id") ON DELETE SET NULL;

CREATE INDEX "job_description_evaluation_upgrade_audit_job_idx"
ON "job_description_evaluation_upgrade_audit" ("job_description_id", "created_at");

CREATE INDEX "job_description_evaluation_upgrade_audit_org_idx"
ON "job_description_evaluation_upgrade_audit" ("organization_id");

ALTER TABLE "studio_interview"
ADD COLUMN "resume_evaluation_artifact_mode" text;

ALTER TABLE "studio_interview"
ADD COLUMN "resume_evaluation_attempt_mode" text;

UPDATE "studio_interview"
SET "resume_evaluation_artifact_mode" = CASE
  WHEN "structured_resume_evaluation" IS NOT NULL THEN 'structured'
  WHEN "resume_review" IS NOT NULL THEN 'legacy'
  ELSE NULL
END;

UPDATE "studio_interview"
SET "resume_evaluation_attempt_mode" = CASE
  WHEN "resume_review_status" IN ('queued', 'processing') THEN
    CASE
      WHEN "structured_resume_evaluation" IS NOT NULL THEN 'structured'
      WHEN "resume_review" IS NOT NULL THEN 'legacy'
      ELSE NULL
    END
  ELSE NULL
END;

ALTER TABLE "studio_interview"
ADD CONSTRAINT "studio_interview_resume_evaluation_artifact_mode_check"
CHECK (
  "resume_evaluation_artifact_mode" IS NULL
  OR "resume_evaluation_artifact_mode" IN ('legacy', 'structured')
);

ALTER TABLE "studio_interview"
ADD CONSTRAINT "studio_interview_resume_evaluation_attempt_mode_check"
CHECK (
  "resume_evaluation_attempt_mode" IS NULL
  OR "resume_evaluation_attempt_mode" IN ('legacy', 'structured')
);
