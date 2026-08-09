ALTER TABLE "meeting_processing_run"
  ADD COLUMN "remote_artifact_purge_attempts" integer DEFAULT 0 NOT NULL,
  ADD CONSTRAINT "meeting_processing_run_remote_purge_attempts_check"
    CHECK ("remote_artifact_purge_attempts" >= 0);

CREATE TABLE "meeting_storage_cleanup_key" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "meeting_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "storage_key" text PRIMARY KEY NOT NULL,
  CONSTRAINT "meeting_storage_cleanup_key_meeting_org_fk"
    FOREIGN KEY ("meeting_id", "organization_id")
    REFERENCES "meeting_session"("id", "organization_id") ON DELETE CASCADE
);

CREATE INDEX "meeting_storage_cleanup_key_meeting_idx"
  ON "meeting_storage_cleanup_key" ("meeting_id", "created_at");
