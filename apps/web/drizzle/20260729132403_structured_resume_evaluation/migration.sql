ALTER TABLE "job_description" ADD COLUMN "evaluation_mode" text;
ALTER TABLE "job_description" ADD COLUMN "lifecycle_status" text;
ALTER TABLE "job_description" ADD COLUMN "published_at" timestamp with time zone;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_preview" jsonb;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_preview_input_hash" text;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_preview_hash" text;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_preview_generated_at" timestamp with time zone;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint" jsonb;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_hash" text;
ALTER TABLE "job_description" ADD COLUMN "evaluation_blueprint_schema_version" integer;
ALTER TABLE "job_description" ADD COLUMN "deduction_rule_set_version" integer;

-- All rows that predate this migration remain on the unchanged legacy workflow.
-- structured_config is deliberately not consulted when establishing lineage.
UPDATE "job_description"
SET
  "evaluation_mode" = 'legacy',
  "lifecycle_status" = 'published',
  "published_at" = "created_at",
  "evaluation_blueprint_preview" = NULL,
  "evaluation_blueprint_preview_input_hash" = NULL,
  "evaluation_blueprint_preview_hash" = NULL,
  "evaluation_blueprint_preview_generated_at" = NULL,
  "evaluation_blueprint" = NULL,
  "evaluation_blueprint_hash" = NULL,
  "evaluation_blueprint_schema_version" = NULL,
  "deduction_rule_set_version" = NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "job_description"
    WHERE "evaluation_mode" <> 'legacy'
       OR "lifecycle_status" <> 'published'
       OR "published_at" IS DISTINCT FROM "created_at"
  ) THEN
    RAISE EXCEPTION 'structured resume migration failed to preserve legacy job lineage';
  END IF;
END
$$;

ALTER TABLE "job_description" ALTER COLUMN "evaluation_mode" SET NOT NULL;
ALTER TABLE "job_description" ALTER COLUMN "evaluation_mode" SET DEFAULT 'structured';
ALTER TABLE "job_description" ALTER COLUMN "lifecycle_status" SET NOT NULL;
ALTER TABLE "job_description" ALTER COLUMN "lifecycle_status" SET DEFAULT 'draft';

ALTER TABLE "studio_interview" ADD COLUMN "structured_resume_evaluation" jsonb;
ALTER TABLE "studio_interview" ADD COLUMN "structured_composite_score" integer;
ALTER TABLE "studio_interview" ADD COLUMN "structured_score_grade" text;
ALTER TABLE "studio_interview" ADD COLUMN "structured_gate_status" text;
ALTER TABLE "studio_interview" ADD COLUMN "structured_gate_sort_rank" integer;

ALTER TABLE "job_description"
ADD CONSTRAINT "job_description_evaluation_mode_check"
CHECK ("evaluation_mode" IN ('legacy', 'structured'));

ALTER TABLE "job_description"
ADD CONSTRAINT "job_description_lifecycle_status_check"
CHECK ("lifecycle_status" IN ('draft', 'published'));

ALTER TABLE "job_description"
ADD CONSTRAINT "job_description_evaluation_lifecycle_check"
CHECK (
  (
    "evaluation_mode" = 'legacy'
    AND "lifecycle_status" = 'published'
    AND "published_at" IS NOT NULL
    AND "evaluation_blueprint_preview" IS NULL
    AND "evaluation_blueprint_preview_input_hash" IS NULL
    AND "evaluation_blueprint_preview_hash" IS NULL
    AND "evaluation_blueprint_preview_generated_at" IS NULL
    AND "evaluation_blueprint" IS NULL
    AND "evaluation_blueprint_hash" IS NULL
    AND "evaluation_blueprint_schema_version" IS NULL
    AND "deduction_rule_set_version" IS NULL
  ) OR (
    "evaluation_mode" = 'structured'
    AND "lifecycle_status" = 'draft'
    AND "published_at" IS NULL
    AND "evaluation_blueprint" IS NULL
    AND "evaluation_blueprint_hash" IS NULL
    AND "evaluation_blueprint_schema_version" IS NULL
    AND "deduction_rule_set_version" IS NULL
    AND (
      (
        "evaluation_blueprint_preview" IS NULL
        AND "evaluation_blueprint_preview_input_hash" IS NULL
        AND "evaluation_blueprint_preview_hash" IS NULL
        AND "evaluation_blueprint_preview_generated_at" IS NULL
      ) OR (
        "evaluation_blueprint_preview" IS NOT NULL
        AND "evaluation_blueprint_preview_input_hash" IS NOT NULL
        AND "evaluation_blueprint_preview_hash" IS NOT NULL
        AND "evaluation_blueprint_preview_generated_at" IS NOT NULL
      )
    )
  ) OR (
    "evaluation_mode" = 'structured'
    AND "lifecycle_status" = 'published'
    AND "published_at" IS NOT NULL
    AND "evaluation_blueprint" IS NOT NULL
    AND "evaluation_blueprint_hash" IS NOT NULL
    AND "evaluation_blueprint_schema_version" IS NOT NULL
    AND "deduction_rule_set_version" IS NOT NULL
    AND "evaluation_blueprint_preview" IS NULL
    AND "evaluation_blueprint_preview_input_hash" IS NULL
    AND "evaluation_blueprint_preview_hash" IS NULL
    AND "evaluation_blueprint_preview_generated_at" IS NULL
  )
);

ALTER TABLE "studio_interview"
ADD CONSTRAINT "studio_interview_structured_evaluation_complete_check"
CHECK (
  (
    "structured_resume_evaluation" IS NULL
    AND "structured_composite_score" IS NULL
    AND "structured_score_grade" IS NULL
    AND "structured_gate_status" IS NULL
    AND "structured_gate_sort_rank" IS NULL
  ) OR (
    "structured_resume_evaluation" IS NOT NULL
    AND "structured_composite_score" BETWEEN 0 AND 100
    AND "structured_score_grade" IN ('recommended', 'matched', 'unmatched')
    AND "structured_gate_status" IN ('passed', 'needs_verification', 'failed')
    AND "structured_gate_sort_rank" IN (0, 1, 2)
  )
);

ALTER TABLE "studio_interview"
ADD CONSTRAINT "studio_interview_structured_gate_rank_check"
CHECK (
  ("structured_gate_status", "structured_gate_sort_rank") IN (
    ('passed', 0),
    ('needs_verification', 1),
    ('failed', 2)
  ) OR (
    "structured_gate_status" IS NULL
    AND "structured_gate_sort_rank" IS NULL
  )
);

CREATE INDEX "studio_interview_structured_job_order_idx"
ON "studio_interview" (
  "organization_id",
  "job_description_id",
  "structured_gate_sort_rank" ASC,
  "structured_composite_score" DESC
);
