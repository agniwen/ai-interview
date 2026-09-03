CREATE UNIQUE INDEX "meeting_processing_run_id_meeting_org_uq"
  ON "meeting_processing_run" ("id", "meeting_id", "organization_id");

CREATE UNIQUE INDEX "meeting_transcript_revision_id_meeting_org_uq"
  ON "meeting_transcript_revision" ("id", "meeting_id", "organization_id");

ALTER TABLE "meeting_processing_run"
  ADD CONSTRAINT "meeting_processing_run_input_transcript_meeting_org_fk"
  FOREIGN KEY ("input_transcript_revision_id", "meeting_id", "organization_id")
  REFERENCES "meeting_transcript_revision" ("id", "meeting_id", "organization_id")
  ON DELETE RESTRICT;

ALTER TABLE "meeting_intelligence_revision"
  ADD CONSTRAINT "meeting_intelligence_revision_meeting_org_fk"
  FOREIGN KEY ("meeting_id", "organization_id")
  REFERENCES "meeting_session" ("id", "organization_id")
  ON DELETE CASCADE,
  ADD CONSTRAINT "meeting_intelligence_revision_run_meeting_org_fk"
  FOREIGN KEY ("processing_run_id", "meeting_id", "organization_id")
  REFERENCES "meeting_processing_run" ("id", "meeting_id", "organization_id")
  ON DELETE RESTRICT,
  ADD CONSTRAINT "meeting_intelligence_revision_transcript_meeting_org_fk"
  FOREIGN KEY ("transcript_revision_id", "meeting_id", "organization_id")
  REFERENCES "meeting_transcript_revision" ("id", "meeting_id", "organization_id")
  ON DELETE RESTRICT;
