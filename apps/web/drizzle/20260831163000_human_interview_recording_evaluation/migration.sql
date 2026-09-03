-- Historical meetings may contain multiple candidate rounds. New meeting writes
-- enforce the single-round product rule in the API without invalidating those rows.
DROP INDEX IF EXISTS "studio_human_interview_meeting_round_meeting_uq";

ALTER TABLE "studio_human_interview_round"
  ADD COLUMN "evaluation" jsonb,
  ADD COLUMN "evaluation_error" text,
  ADD COLUMN "evaluation_status" text DEFAULT 'not_started' NOT NULL,
  ADD COLUMN "evaluation_submitted_at" timestamp with time zone,
  ADD COLUMN "evaluation_transcript_revision_id" text,
  ADD COLUMN "evaluation_updated_at" timestamp with time zone,
  ADD COLUMN "evaluation_updated_by" text,
  ADD CONSTRAINT "studio_human_interview_round_evaluation_status_check"
    CHECK ("evaluation_status" IN ('not_started', 'generating', 'draft', 'submitted', 'failed')),
  ADD CONSTRAINT "studio_human_interview_round_evaluation_transcript_revision_fk"
    FOREIGN KEY ("evaluation_transcript_revision_id")
    REFERENCES "meeting_transcript_revision" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "studio_human_interview_round_evaluation_updated_by_fk"
    FOREIGN KEY ("evaluation_updated_by") REFERENCES "user" ("id") ON DELETE SET NULL;

CREATE INDEX "studio_human_interview_round_evaluation_status_idx"
  ON "studio_human_interview_round" ("evaluation_status");

ALTER TABLE "studio_human_interview_meeting"
  ADD COLUMN "processing_meeting_session_id" text,
  ADD COLUMN "recording_duration_ms" integer,
  ADD COLUMN "recording_error" text,
  ADD COLUMN "recording_size_bytes" integer,
  ADD COLUMN "recording_status" text DEFAULT 'pending' NOT NULL,
  ADD CONSTRAINT "studio_human_interview_meeting_processing_session_fk"
    FOREIGN KEY ("processing_meeting_session_id") REFERENCES "meeting_session" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "studio_human_interview_meeting_recording_status_check"
    CHECK ("recording_status" IN ('pending', 'starting', 'active', 'completed', 'failed'));

CREATE UNIQUE INDEX "studio_human_interview_meeting_processing_session_uq"
  ON "studio_human_interview_meeting" ("processing_meeting_session_id")
  WHERE "processing_meeting_session_id" IS NOT NULL;

CREATE INDEX "studio_human_interview_meeting_recording_status_idx"
  ON "studio_human_interview_meeting" ("organization_id", "recording_status");

ALTER TABLE "meeting_transcription_chunk"
  DROP CONSTRAINT "meeting_transcription_chunk_track_check",
  ADD CONSTRAINT "meeting_transcription_chunk_track_check"
    CHECK ("track" IN ('microphone', 'system', 'mixed'));
