CREATE UNIQUE INDEX "meeting_question_thread_id_meeting_org_creator_uq"
  ON "meeting_question_thread" ("id", "meeting_id", "organization_id", "created_by");

ALTER TABLE "meeting_question_exchange"
  ADD CONSTRAINT "meeting_question_exchange_thread_creator_fk"
    FOREIGN KEY ("thread_id", "meeting_id", "organization_id", "created_by")
    REFERENCES "meeting_question_thread"("id", "meeting_id", "organization_id", "created_by")
    ON DELETE CASCADE;

CREATE INDEX "meeting_question_exchange_creator_created_idx"
  ON "meeting_question_exchange" ("organization_id", "created_by", "created_at");
