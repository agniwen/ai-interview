CREATE TABLE "meeting_transcription_chunk" (
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "source_manifest_sha256" text NOT NULL,
  "policy_revision" integer NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "region" text NOT NULL,
  "track" text NOT NULL,
  "chunk_index" integer NOT NULL,
  "start_ms" integer NOT NULL,
  "end_ms" integer NOT NULL,
  "transcript" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_transcription_chunk_index_check" CHECK ("chunk_index" >= 0),
  CONSTRAINT "meeting_transcription_chunk_time_check" CHECK ("end_ms" > "start_ms"),
  CONSTRAINT "meeting_transcription_chunk_track_check" CHECK (
    "track" IN ('microphone', 'system')
  )
);

CREATE UNIQUE INDEX "meeting_transcription_chunk_input_uq"
  ON "meeting_transcription_chunk" (
    "meeting_id", "source_manifest_sha256", "policy_revision", "provider", "model", "region",
    "track", "chunk_index"
  );
