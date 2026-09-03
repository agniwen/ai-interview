CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE "meeting_search_projection" (
  "meeting_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "search_text" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_search_projection_meeting_id_meeting_session_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_search_projection_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_search_projection_meeting_org_fk"
    FOREIGN KEY ("meeting_id", "organization_id")
    REFERENCES "meeting_session"("id", "organization_id") ON DELETE CASCADE
);

CREATE INDEX "meeting_search_projection_org_idx"
  ON "meeting_search_projection" ("organization_id");

CREATE INDEX "meeting_search_projection_text_trgm_idx"
  ON "meeting_search_projection" USING gin ("search_text" gin_trgm_ops);

INSERT INTO "meeting_search_projection" (
  "meeting_id",
  "organization_id",
  "search_text",
  "updated_at"
)
SELECT
  session."id",
  session."organization_id",
  left(
    concat_ws(
      E'\n',
      session."title",
      creator."name",
      session."saved_at"::text,
      transcript."speakers",
      transcript."content",
      notes."content"
    ),
    3500000
  ),
  now()
FROM "meeting_session" AS session
INNER JOIN "user" AS creator ON creator."id" = session."owner_id"
LEFT JOIN LATERAL (
  SELECT
    count(*) AS "turn_count",
    coalesce(sum(char_length(turn."text")), 0) AS "character_count"
  FROM "meeting_transcript_turn" AS turn
  WHERE turn."revision_id" = session."active_transcript_revision_id"
) AS transcript_stats ON true
LEFT JOIN LATERAL (
  SELECT
    string_agg(turn."text", E'\n' ORDER BY turn."sequence") AS "content",
    string_agg(DISTINCT turn."speaker_display_name", E'\n') AS "speakers"
  FROM "meeting_transcript_turn" AS turn
  WHERE turn."revision_id" = session."active_transcript_revision_id"
) AS transcript ON transcript_stats."turn_count" <= 10000
  AND transcript_stats."character_count" <= 1000000
LEFT JOIN LATERAL (
  SELECT
    count(*) AS "note_count",
    coalesce(sum(char_length(note."body")), 0) AS "character_count"
  FROM "meeting_note" AS note
  WHERE note."meeting_id" = session."id"
    AND note."organization_id" = session."organization_id"
) AS note_stats ON true
LEFT JOIN LATERAL (
  SELECT string_agg(
    note."body",
    E'\n' ORDER BY note."meeting_time_ms", note."created_at"
  ) AS "content"
  FROM "meeting_note" AS note
  WHERE note."meeting_id" = session."id"
    AND note."organization_id" = session."organization_id"
) AS notes ON note_stats."note_count" <= 200
  AND note_stats."character_count" <= 1000000;
