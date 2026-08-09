ALTER TABLE "meeting_purge_tombstone"
  ADD COLUMN "manifest_sha256" text,
  ADD COLUMN "owner_id" text;

UPDATE "meeting_purge_tombstone"
SET
  "manifest_sha256" = repeat('0', 64),
  "owner_id" = 'legacy-purge-tombstone'
WHERE "manifest_sha256" IS NULL OR "owner_id" IS NULL;

ALTER TABLE "meeting_purge_tombstone"
  ALTER COLUMN "manifest_sha256" SET NOT NULL,
  ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "meeting_processing_run"
  ADD COLUMN "remote_artifact_purge_status" text,
  ADD CONSTRAINT "meeting_processing_run_remote_purge_status_check"
    CHECK (
      "remote_artifact_purge_status" IS NULL
      OR "remote_artifact_purge_status" IN ('deleted', 'failed', 'unsupported')
    );
