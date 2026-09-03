CREATE TABLE IF NOT EXISTS `local_meeting_session` (
	`ended_at` text,
	`id` text PRIMARY KEY,
	`live_transcript_draft` text,
	`recruiting_record_id` text,
	`segment_count` integer DEFAULT 1 NOT NULL,
	`started_at` text NOT NULL,
	`state` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `local_meeting_session_updated_idx` ON `local_meeting_session` (`updated_at`);
