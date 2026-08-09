ALTER TABLE "meeting_session"
  ADD COLUMN "purge_initial_sweep_completed_at" timestamp with time zone;

ALTER TABLE "meeting_storage_cleanup_key"
  ADD COLUMN "initial_sweep_completed_at" timestamp with time zone;

ALTER TABLE "meeting_session"
  DROP CONSTRAINT "meeting_session_trash_state_check";

ALTER TABLE "meeting_session"
  ADD CONSTRAINT "meeting_session_trash_state_check" CHECK (
    (
      "status" NOT IN ('trashed', 'purging')
      AND "trashed_at" IS NULL
      AND "trashed_from_status" IS NULL
      AND "purge_after" IS NULL
      AND "purge_claim_token" IS NULL
      AND "purge_initial_sweep_completed_at" IS NULL
      AND "purge_lease_expires_at" IS NULL
    ) OR (
      "status" = 'trashed'
      AND "trashed_at" IS NOT NULL
      AND "trashed_from_status" IS NOT NULL
      AND "purge_after" IS NOT NULL
      AND "purge_claim_token" IS NULL
      AND "purge_lease_expires_at" IS NULL
    ) OR (
      "status" = 'purging'
      AND "trashed_at" IS NOT NULL
      AND "trashed_from_status" IS NOT NULL
      AND "purge_after" IS NOT NULL
    )
  );
