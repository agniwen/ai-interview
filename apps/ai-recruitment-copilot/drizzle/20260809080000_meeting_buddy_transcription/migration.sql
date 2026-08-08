CREATE TABLE "meeting_transcription_policy" (
  "organization_id" text PRIMARY KEY NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "allowed_providers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_provider" text,
  "revision" integer DEFAULT 1 NOT NULL,
  "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_transcription_policy_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "meeting_transcription_policy_selected_check" CHECK (
    "selected_provider" IS NULL OR "allowed_providers" ? "selected_provider"
  )
);

ALTER TABLE "meeting_session"
  ADD COLUMN "active_transcript_revision_id" text,
  ADD COLUMN "transcription_status" text DEFAULT 'pending' NOT NULL,
  ADD COLUMN "transcription_run_id" text,
  ADD COLUMN "transcription_error" text,
  ADD CONSTRAINT "meeting_session_transcription_status_check" CHECK (
    "transcription_status" IN ('pending', 'processing', 'ready', 'failed')
  );

CREATE TABLE "meeting_processing_run" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "stage" text NOT NULL,
  "status" text NOT NULL,
  "attempt" integer NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "region" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  CONSTRAINT "meeting_processing_run_attempt_check" CHECK ("attempt" > 0),
  CONSTRAINT "meeting_processing_run_stage_check" CHECK ("stage" IN ('final-transcription')),
  CONSTRAINT "meeting_processing_run_status_check" CHECK (
    "status" IN ('processing', 'succeeded', 'failed')
  )
);

CREATE INDEX "meeting_processing_run_meeting_stage_idx"
  ON "meeting_processing_run" ("meeting_id", "stage", "started_at");
CREATE INDEX "meeting_processing_run_org_status_idx"
  ON "meeting_processing_run" ("organization_id", "status", "started_at");

CREATE TABLE "meeting_transcript_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "kind" text NOT NULL,
  "source_manifest_sha256" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "region" text NOT NULL,
  "language" text,
  "processing_run_id" text NOT NULL REFERENCES "meeting_processing_run"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_transcript_revision_kind_check" CHECK ("kind" IN ('final', 'human')),
  CONSTRAINT "meeting_transcript_revision_number_check" CHECK ("revision" > 0)
);

CREATE UNIQUE INDEX "meeting_transcript_revision_meeting_revision_uq"
  ON "meeting_transcript_revision" ("meeting_id", "revision");
CREATE UNIQUE INDEX "meeting_transcript_revision_machine_input_uq"
  ON "meeting_transcript_revision" (
    "meeting_id", "kind", "source_manifest_sha256", "provider", "model", "region"
  );
CREATE INDEX "meeting_transcript_revision_org_created_idx"
  ON "meeting_transcript_revision" ("organization_id", "created_at");

CREATE TABLE "meeting_transcript_turn" (
  "id" text PRIMARY KEY NOT NULL,
  "revision_id" text NOT NULL REFERENCES "meeting_transcript_revision"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "track" text NOT NULL,
  "speaker_key" text NOT NULL,
  "start_ms" integer NOT NULL,
  "end_ms" integer NOT NULL,
  "text" text NOT NULL,
  "confidence" double precision,
  CONSTRAINT "meeting_transcript_turn_sequence_check" CHECK ("sequence" >= 0),
  CONSTRAINT "meeting_transcript_turn_time_check" CHECK ("end_ms" > "start_ms"),
  CONSTRAINT "meeting_transcript_turn_track_check" CHECK ("track" IN ('local', 'remote'))
);

CREATE UNIQUE INDEX "meeting_transcript_turn_revision_sequence_uq"
  ON "meeting_transcript_turn" ("revision_id", "sequence");
CREATE INDEX "meeting_transcript_turn_revision_time_idx"
  ON "meeting_transcript_turn" ("revision_id", "start_ms", "end_ms");
