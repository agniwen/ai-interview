ALTER TABLE "meeting_session"
  ADD COLUMN "purge_after" timestamp with time zone,
  ADD COLUMN "purge_claim_token" text,
  ADD COLUMN "purge_lease_expires_at" timestamp with time zone,
  ADD COLUMN "trashed_at" timestamp with time zone,
  ADD COLUMN "trashed_from_status" text;

ALTER TABLE "meeting_session"
  ADD CONSTRAINT "meeting_session_trash_state_check"
  CHECK (
    (
      "status" NOT IN ('trashed', 'purging')
      AND "trashed_at" IS NULL
      AND "trashed_from_status" IS NULL
      AND "purge_after" IS NULL
      AND "purge_claim_token" IS NULL
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

CREATE INDEX "meeting_session_purge_due_idx"
  ON "meeting_session" ("status", "purge_after");
