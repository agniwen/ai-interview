ALTER TABLE "meeting_transcript_revision"
  DROP CONSTRAINT "meeting_transcript_revision_source_check",
  ADD CONSTRAINT "meeting_transcript_revision_source_check" CHECK (
    ("kind" = 'final' AND "based_on_revision_id" IS NULL AND "processing_run_id" IS NOT NULL)
    OR ("kind" = 'human' AND "processing_run_id" IS NULL)
  );
