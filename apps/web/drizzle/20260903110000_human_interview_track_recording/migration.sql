ALTER TABLE "studio_human_interview_meeting" ADD COLUMN "recording_tracks" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_recording_asset" ADD COLUMN "recording_identity" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_transcript_turn" ADD COLUMN "attribution" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_transcription_chunk" DROP CONSTRAINT "meeting_transcription_chunk_track_check";
--> statement-breakpoint
ALTER TABLE "meeting_transcription_chunk" ADD CONSTRAINT "meeting_transcription_chunk_track_check"
CHECK ("track" IN ('microphone', 'system', 'candidate', 'mixed') OR "track" ~ '^participant-[a-zA-Z0-9-]+$');
