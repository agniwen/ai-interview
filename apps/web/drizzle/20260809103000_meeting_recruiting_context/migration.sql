CREATE TABLE "meeting_recruiting_context" (
  "meeting_id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "recruiting_record_id" text NOT NULL,
  "linked_by" text,
  "linked_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meeting_recruiting_context_meeting_id_fk"
    FOREIGN KEY ("meeting_id") REFERENCES "meeting_session"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_recruiting_context_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_recruiting_context_recruiting_record_id_fk"
    FOREIGN KEY ("recruiting_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_recruiting_context_linked_by_fk"
    FOREIGN KEY ("linked_by") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX "meeting_recruiting_context_org_record_idx"
  ON "meeting_recruiting_context" ("organization_id", "recruiting_record_id");
