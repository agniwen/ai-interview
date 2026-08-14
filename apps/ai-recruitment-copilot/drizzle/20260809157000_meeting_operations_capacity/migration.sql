ALTER TABLE "meeting_session"
ADD COLUMN "upload_lease_expires_at" timestamp with time zone;

UPDATE "meeting_session"
SET "upload_lease_expires_at" = now() + interval '121 minutes'
WHERE "status" = 'uploading'
  OR (
    "status" IN ('trashed', 'purging')
    AND "trashed_from_status" = 'uploading'
  );

ALTER TABLE "meeting_session"
ADD CONSTRAINT "meeting_session_upload_lease_check"
CHECK ("status" <> 'uploading' OR "upload_lease_expires_at" IS NOT NULL);

CREATE INDEX "meeting_session_upload_lease_idx"
ON "meeting_session" ("upload_lease_expires_at");

CREATE TABLE "meeting_live_transcript_lease" (
  "capture_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "track" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_live_transcript_lease_track_check" CHECK ("track" IN ('microphone', 'system')),
  CONSTRAINT "meeting_live_transcript_lease_pk" PRIMARY KEY ("organization_id", "capture_id", "track")
);

CREATE INDEX "meeting_live_transcript_lease_expires_idx"
ON "meeting_live_transcript_lease" ("expires_at");
