CREATE TABLE `local_meeting_processing` (
  `meeting_id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `resource_meeting_id` text NOT NULL,
  `workspace_id` text NOT NULL,
  `workspace_slug` text NOT NULL,
  `input_revision` text NOT NULL,
  `deleted_at` integer,
  `audio_released_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_meeting_task` (
  `id` text PRIMARY KEY NOT NULL,
  `meeting_id` text NOT NULL REFERENCES `local_meeting_processing`(`meeting_id`),
  `input_revision` text NOT NULL,
  `kind` text NOT NULL,
  `state` text DEFAULT 'ready' NOT NULL,
  `checkpoint` text,
  `output` text,
  `attempt_token` text,
  `retry_count` integer DEFAULT 0 NOT NULL,
  `available_at` integer NOT NULL,
  `lease_until` integer,
  `error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_meeting_task_ready_idx` ON `local_meeting_task` (`state`, `available_at`);
--> statement-breakpoint
CREATE TABLE `local_meeting_task_dependency` (
  `task_id` text NOT NULL REFERENCES `local_meeting_task`(`id`),
  `dependency_id` text NOT NULL REFERENCES `local_meeting_task`(`id`),
  PRIMARY KEY (`task_id`, `dependency_id`)
);
