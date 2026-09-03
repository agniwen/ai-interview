ALTER TABLE "meeting_session"
  ADD CONSTRAINT "meeting_session_active_transcript_revision_fk"
    FOREIGN KEY ("active_transcript_revision_id")
    REFERENCES "meeting_transcript_revision"("id")
    ON DELETE SET NULL,
  ADD CONSTRAINT "meeting_session_transcription_run_fk"
    FOREIGN KEY ("transcription_run_id")
    REFERENCES "meeting_processing_run"("id")
    ON DELETE SET NULL;
