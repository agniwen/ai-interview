ALTER TABLE "human_interview_meeting" ADD COLUMN "transcription_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "human_interview_meeting" ADD COLUMN "recording_ingested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "human_transcription_run" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "human_transcription_run" ADD COLUMN "drained_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "human_transcription_run" ADD COLUMN "cutoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "source_kind" text DEFAULT 'recording' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "realtime_run_id" text;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "review_transcript_revision_id" text;--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ADD COLUMN "realtime_run_id" text;--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ADD COLUMN "source_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ADD COLUMN "quality" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_purge_tombstone" ALTER COLUMN "manifest_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_session" ALTER COLUMN "manifest_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ALTER COLUMN "source_manifest_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_realtime_run_id_human_transcription_run_id_fkey" FOREIGN KEY ("realtime_run_id") REFERENCES "human_transcription_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_Pva7RjIyrVYF_fkey" FOREIGN KEY ("review_transcript_revision_id") REFERENCES "meeting_transcript_revision"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ADD CONSTRAINT "meeting_transcript_revision_4AjqzRPOz0O3_fkey" FOREIGN KEY ("realtime_run_id") REFERENCES "human_transcription_run"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "meeting_session" ADD CONSTRAINT "meeting_session_source_check" CHECK (("source_kind" = 'recording' and "manifest_sha256" is not null and "realtime_run_id" is null) or ("source_kind" = 'livekit_realtime' and "realtime_run_id" is not null));--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" ADD CONSTRAINT "meeting_transcript_revision_quality_check" CHECK ("quality" in ('legacy', 'eligible', 'needs_review'));--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" DROP CONSTRAINT "meeting_transcript_revision_kind_check", ADD CONSTRAINT "meeting_transcript_revision_kind_check" CHECK ("kind" in ('final', 'human', 'realtime'));--> statement-breakpoint
ALTER TABLE "meeting_transcript_revision" DROP CONSTRAINT "meeting_transcript_revision_source_check", ADD CONSTRAINT "meeting_transcript_revision_source_check" CHECK (("kind" = 'final' and "based_on_revision_id" is null and "processing_run_id" is not null and "source_manifest_sha256" is not null and "realtime_run_id" is null and "source_snapshot" is null)
        or ("kind" = 'realtime' and "based_on_revision_id" is null and "processing_run_id" is null and "source_manifest_sha256" is null and "realtime_run_id" is not null and "source_snapshot" is not null)
        or ("kind" = 'human' and "processing_run_id" is null and (("source_manifest_sha256" is not null and "source_snapshot" is null and "realtime_run_id" is null) or ("source_manifest_sha256" is null and "source_snapshot" is not null and "realtime_run_id" is not null))));
--> statement-breakpoint
UPDATE human_interview_meeting SET recording_ingested_at = updated_at WHERE processing_meeting_session_id IS NOT NULL;
