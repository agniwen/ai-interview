ALTER TABLE "studio_human_interview_meeting"
  ADD COLUMN "candidate_recording_duration_ms" integer,
  ADD COLUMN "candidate_recording_egress_id" text,
  ADD COLUMN "candidate_recording_error" text,
  ADD COLUMN "candidate_recording_file_key" text,
  ADD COLUMN "candidate_recording_size_bytes" integer,
  ADD COLUMN "candidate_recording_status" text DEFAULT 'pending' NOT NULL,
  ADD CONSTRAINT "studio_human_interview_meeting_candidate_recording_status_check"
    CHECK ("candidate_recording_status" IN ('pending', 'starting', 'active', 'completed', 'failed'));

ALTER TABLE "meeting_recording_asset"
  ADD COLUMN "speaker_display_name" text;

ALTER TABLE "meeting_transcription_chunk"
  DROP CONSTRAINT "meeting_transcription_chunk_track_check",
  ADD CONSTRAINT "meeting_transcription_chunk_track_check"
    CHECK ("track" IN ('microphone', 'system', 'mixed', 'candidate'));
