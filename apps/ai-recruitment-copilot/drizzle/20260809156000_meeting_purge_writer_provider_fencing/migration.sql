ALTER TABLE "meeting_storage_cleanup_key"
  ADD COLUMN "writer_lease_expires_at" timestamp with time zone;

ALTER TABLE "meeting_processing_run"
  ADD COLUMN "remote_artifact_purge_execution_token" text;
