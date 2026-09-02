CREATE TABLE "studio_human_interview_evaluation_snapshot" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "evaluation" jsonb NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "meeting_session_id" text,
  "organization_id" text NOT NULL,
  "outcome" text,
  "round_id" text NOT NULL,
  "source" text NOT NULL,
  "transcript_revision_id" text,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_meeting_session_id_fk"
    FOREIGN KEY ("meeting_session_id") REFERENCES "meeting_session"("id") ON DELETE SET NULL,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_round_id_fk"
    FOREIGN KEY ("round_id") REFERENCES "studio_human_interview_round"("id") ON DELETE CASCADE,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_transcript_revision_id_fk"
    FOREIGN KEY ("transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE SET NULL,
  CONSTRAINT "studio_human_interview_evaluation_snapshot_source_check"
    CHECK ("source" IN ('ai_generated', 'human_submitted'))
);

CREATE INDEX "studio_human_interview_evaluation_snapshot_round_created_idx"
  ON "studio_human_interview_evaluation_snapshot" ("round_id", "created_at");

CREATE INDEX "studio_human_interview_evaluation_snapshot_org_created_idx"
  ON "studio_human_interview_evaluation_snapshot" ("organization_id", "created_at");
