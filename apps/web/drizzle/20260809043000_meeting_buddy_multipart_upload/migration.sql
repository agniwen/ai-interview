ALTER TABLE "meeting_recording_asset" ADD COLUMN "multipart_parts" jsonb;
--> statement-breakpoint
ALTER TABLE "meeting_recording_asset" ADD COLUMN "multipart_upload_id" text;
--> statement-breakpoint
ALTER TABLE "meeting_recording_asset" ADD COLUMN "upload_mode" text DEFAULT 'single' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meeting_session" ADD COLUMN "recovery_copy_delete_after" timestamp with time zone;
