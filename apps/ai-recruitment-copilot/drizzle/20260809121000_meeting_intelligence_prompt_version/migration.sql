ALTER TABLE "meeting_processing_run"
  ADD COLUMN "prompt_version" text;

ALTER TABLE "meeting_processing_run"
  DROP CONSTRAINT "meeting_processing_run_intelligence_input_check",
  ADD CONSTRAINT "meeting_processing_run_intelligence_input_check" CHECK (
    (
      "stage" = 'meeting-intelligence'
      AND "input_transcript_revision_id" IS NOT NULL
      AND "template_key" IS NOT NULL
      AND "prompt_version" IS NOT NULL
      AND "request_kind" IN ('automatic', 'manual')
    ) OR (
      "stage" = 'final-transcription'
      AND "input_transcript_revision_id" IS NULL
      AND "template_key" IS NULL
      AND "prompt_version" IS NULL
      AND "request_kind" IS NULL
    )
  );
