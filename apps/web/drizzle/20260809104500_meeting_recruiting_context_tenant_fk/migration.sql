CREATE UNIQUE INDEX "meeting_session_id_org_uq"
  ON "meeting_session" ("id", "organization_id");

CREATE UNIQUE INDEX "studio_interview_id_org_uq"
  ON "studio_interview" ("id", "organization_id");

ALTER TABLE "meeting_recruiting_context"
  ADD CONSTRAINT "meeting_recruiting_context_meeting_org_fk"
  FOREIGN KEY ("meeting_id", "organization_id")
  REFERENCES "meeting_session" ("id", "organization_id")
  ON DELETE CASCADE;

ALTER TABLE "meeting_recruiting_context"
  ADD CONSTRAINT "meeting_recruiting_context_record_org_fk"
  FOREIGN KEY ("recruiting_record_id", "organization_id")
  REFERENCES "studio_interview" ("id", "organization_id")
  ON DELETE CASCADE;
