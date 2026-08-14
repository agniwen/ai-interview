ALTER TABLE "meeting_processing_run"
  ADD COLUMN "pipeline_version" text NOT NULL DEFAULT 'final-v1';

ALTER TABLE "meeting_transcript_revision"
  ADD COLUMN "pipeline_version" text NOT NULL DEFAULT 'final-v1';

DROP INDEX "meeting_transcript_revision_machine_input_uq";
CREATE UNIQUE INDEX "meeting_transcript_revision_machine_input_uq"
  ON "meeting_transcript_revision" (
    "meeting_id", "kind", "source_manifest_sha256", "provider", "model", "region",
    "pipeline_version"
  );

ALTER TABLE "meeting_transcription_chunk"
  ADD COLUMN "pipeline_version" text NOT NULL DEFAULT 'final-v1',
  ADD COLUMN "processing_run_id" text REFERENCES "meeting_processing_run"("id") ON DELETE SET NULL,
  ADD COLUMN "status" text NOT NULL DEFAULT 'succeeded',
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  ALTER COLUMN "transcript" DROP NOT NULL,
  ADD CONSTRAINT "meeting_transcription_chunk_status_check" CHECK (
    "status" IN ('processing', 'succeeded', 'failed')
  ),
  ADD CONSTRAINT "meeting_transcription_chunk_result_check" CHECK (
    ("status" = 'succeeded') = ("transcript" IS NOT NULL)
  );

DROP INDEX "meeting_transcription_chunk_input_uq";
CREATE UNIQUE INDEX "meeting_transcription_chunk_input_uq"
  ON "meeting_transcription_chunk" (
    "meeting_id", "source_manifest_sha256", "policy_revision", "provider", "model", "region",
    "pipeline_version", "track", "chunk_index", "start_ms", "end_ms"
  );
