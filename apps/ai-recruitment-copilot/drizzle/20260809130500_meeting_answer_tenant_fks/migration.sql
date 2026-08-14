CREATE UNIQUE INDEX "meeting_intelligence_revision_id_meeting_org_uq"
  ON "meeting_intelligence_revision" ("id", "meeting_id", "organization_id");

ALTER TABLE "meeting_question_exchange"
  ADD CONSTRAINT "meeting_question_exchange_transcript_meeting_org_fk"
    FOREIGN KEY ("input_transcript_revision_id", "meeting_id", "organization_id")
    REFERENCES "meeting_transcript_revision"("id", "meeting_id", "organization_id") ON DELETE RESTRICT,
  ADD CONSTRAINT "meeting_question_exchange_intelligence_meeting_org_fk"
    FOREIGN KEY ("input_intelligence_revision_id", "meeting_id", "organization_id")
    REFERENCES "meeting_intelligence_revision"("id", "meeting_id", "organization_id");
