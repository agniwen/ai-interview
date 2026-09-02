ALTER TABLE "studio_human_interview_meeting_interviewer"
  ADD COLUMN "live_transcript_draft_version" integer DEFAULT 0 NOT NULL;

ALTER TABLE "studio_human_interview_meeting_interviewer"
  ADD CONSTRAINT "studio_human_interview_meeting_interviewer_draft_version_check"
  CHECK ("live_transcript_draft_version" >= 0);
