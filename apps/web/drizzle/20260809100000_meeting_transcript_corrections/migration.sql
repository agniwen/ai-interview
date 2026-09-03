ALTER TABLE "meeting_transcript_revision"
  ADD COLUMN "based_on_revision_id" text,
  ADD COLUMN "created_by" text,
  ALTER COLUMN "processing_run_id" DROP NOT NULL,
  ADD CONSTRAINT "meeting_transcript_revision_based_on_revision_id_fk"
    FOREIGN KEY ("based_on_revision_id") REFERENCES "meeting_transcript_revision"("id"),
  ADD CONSTRAINT "meeting_transcript_revision_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "meeting_transcript_revision_source_check" CHECK (
    ("kind" = 'final' AND "based_on_revision_id" IS NULL AND "processing_run_id" IS NOT NULL)
    OR ("kind" = 'human' AND "based_on_revision_id" IS NOT NULL AND "processing_run_id" IS NULL)
  );

ALTER TABLE "meeting_transcript_turn"
  ADD COLUMN "speaker_display_name" text;

DROP INDEX "meeting_transcript_revision_machine_input_uq";
CREATE UNIQUE INDEX "meeting_transcript_revision_machine_input_uq"
  ON "meeting_transcript_revision" (
    "meeting_id", "source_manifest_sha256", "provider", "model", "region", "pipeline_version"
  )
  WHERE "kind" = 'final';

CREATE INDEX "meeting_transcript_revision_based_on_idx"
  ON "meeting_transcript_revision" ("based_on_revision_id");
