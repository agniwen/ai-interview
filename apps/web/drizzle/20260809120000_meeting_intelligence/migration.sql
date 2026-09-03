ALTER TABLE "meeting_processing_run"
  ADD COLUMN "execution_token" text,
  ADD COLUMN "input_transcript_revision_id" text,
  ADD COLUMN "request_kind" text,
  ADD COLUMN "requested_by" text,
  ADD COLUMN "result" jsonb,
  ADD COLUMN "template_key" text,
  ADD CONSTRAINT "meeting_processing_run_input_transcript_revision_id_fk"
    FOREIGN KEY ("input_transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "meeting_processing_run_requested_by_fk"
    FOREIGN KEY ("requested_by") REFERENCES "user"("id") ON DELETE SET NULL;

ALTER TABLE "meeting_processing_run"
  DROP CONSTRAINT "meeting_processing_run_attempt_check",
  DROP CONSTRAINT "meeting_processing_run_stage_check",
  DROP CONSTRAINT "meeting_processing_run_status_check",
  ADD CONSTRAINT "meeting_processing_run_attempt_check" CHECK ("attempt" >= 0),
  ADD CONSTRAINT "meeting_processing_run_stage_check" CHECK (
    "stage" IN ('final-transcription', 'meeting-intelligence')
  ),
  ADD CONSTRAINT "meeting_processing_run_status_check" CHECK (
    "status" IN ('pending', 'processing', 'succeeded', 'failed')
  ),
  ADD CONSTRAINT "meeting_processing_run_intelligence_input_check" CHECK (
    (
      "stage" = 'meeting-intelligence'
      AND "input_transcript_revision_id" IS NOT NULL
      AND "template_key" IS NOT NULL
      AND "request_kind" IN ('automatic', 'manual')
    ) OR (
      "stage" = 'final-transcription'
      AND "input_transcript_revision_id" IS NULL
      AND "template_key" IS NULL
      AND "request_kind" IS NULL
    )
  );

CREATE TABLE "meeting_intelligence_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "revision" integer NOT NULL,
  "transcript_revision_id" text NOT NULL,
  "template_key" text NOT NULL,
  "content" jsonb NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "processing_run_id" text NOT NULL UNIQUE,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_intelligence_revision_meeting_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_intelligence_revision_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_intelligence_revision_transcript_revision_id_fk"
    FOREIGN KEY ("transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE RESTRICT,
  CONSTRAINT "meeting_intelligence_revision_processing_run_id_fk"
    FOREIGN KEY ("processing_run_id") REFERENCES "meeting_processing_run"("id") ON DELETE RESTRICT,
  CONSTRAINT "meeting_intelligence_revision_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "meeting_intelligence_revision_number_check" CHECK ("revision" > 0),
  CONSTRAINT "meeting_intelligence_revision_template_check" CHECK (
    "template_key" IN ('general', 'recruiting-interview')
  )
);

CREATE UNIQUE INDEX "meeting_intelligence_revision_meeting_revision_uq"
  ON "meeting_intelligence_revision" ("meeting_id", "revision");
CREATE INDEX "meeting_intelligence_revision_org_created_idx"
  ON "meeting_intelligence_revision" ("organization_id", "created_at");
CREATE INDEX "meeting_intelligence_revision_transcript_idx"
  ON "meeting_intelligence_revision" ("transcript_revision_id");

ALTER TABLE "meeting_session"
  ADD COLUMN "active_intelligence_revision_id" text,
  ADD COLUMN "intelligence_error" text,
  ADD COLUMN "intelligence_run_id" text,
  ADD COLUMN "intelligence_status" text DEFAULT 'pending' NOT NULL,
  ADD CONSTRAINT "meeting_session_active_intelligence_revision_id_fk"
    FOREIGN KEY ("active_intelligence_revision_id") REFERENCES "meeting_intelligence_revision"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "meeting_session_intelligence_run_id_fk"
    FOREIGN KEY ("intelligence_run_id") REFERENCES "meeting_processing_run"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "meeting_session_intelligence_status_check" CHECK (
    "intelligence_status" IN ('pending', 'processing', 'ready', 'failed')
  );
