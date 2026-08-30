ALTER TABLE "meeting_transcription_policy"
ADD COLUMN "fallback_provider" text,
ADD COLUMN "selection_reason" text;

UPDATE "meeting_transcription_policy"
SET "selection_reason" = 'Migrated legacy provider selection pending corpus re-evaluation.'
WHERE "selected_provider" IS NOT NULL;

ALTER TABLE "meeting_transcription_policy"
ADD CONSTRAINT "meeting_transcription_policy_fallback_check"
CHECK (
  "fallback_provider" IS NULL OR (
    "selected_provider" IS NOT NULL
    AND "fallback_provider" <> "selected_provider"
    AND "allowed_providers" ? "fallback_provider"
  )
),
ADD CONSTRAINT "meeting_transcription_policy_reason_check"
CHECK (
  ("selected_provider" IS NULL AND "selection_reason" IS NULL)
  OR (
    "selected_provider" IS NOT NULL
    AND "selection_reason" IS NOT NULL
    AND length(trim("selection_reason")) BETWEEN 10 AND 500
  )
);
