CREATE TABLE "human_interview_document_sync" (
  "snapshot_id" text PRIMARY KEY REFERENCES "studio_human_interview_evaluation_snapshot"("id") ON DELETE CASCADE,
  "round_id" text NOT NULL UNIQUE REFERENCES "studio_human_interview_round"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "document_id" text,
  "document_url" text,
  "provider_id" text,
  "block_id" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "lease_owner" text,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "error" text,
  "synced_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "human_interview_document_sync_status_check" CHECK ("status" IN ('pending', 'syncing', 'waiting_document', 'failed', 'synced'))
);
CREATE INDEX "human_interview_document_sync_due_idx" ON "human_interview_document_sync" ("status", "next_attempt_at");
