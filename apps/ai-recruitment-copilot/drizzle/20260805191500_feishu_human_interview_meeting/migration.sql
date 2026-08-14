ALTER TABLE "session"
ADD COLUMN "auth_provider_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_app_link" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_attendee_open_ids" jsonb;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_calendar_event_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_calendar_event_url" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_calendar_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_last_error" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_meeting_no" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_meeting_url" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_owner_open_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_provider_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_reserve_id" text;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_synced_at" timestamp with time zone;

ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_sync_status" text;

ALTER TABLE "studio_human_interview_meeting"
ADD CONSTRAINT "studio_human_interview_meeting_feishu_provider_check"
CHECK (
  "feishu_provider_id" IS NULL
  OR "feishu_provider_id" IN ('feishu', 'feishu-jiguang-hr')
);

ALTER TABLE "studio_human_interview_meeting"
ADD CONSTRAINT "studio_human_interview_meeting_feishu_status_check"
CHECK (
  "feishu_sync_status" IS NULL
  OR "feishu_sync_status" IN ('pending', 'creating', 'ready', 'failed', 'unknown')
);

ALTER TABLE "studio_human_interview_meeting_interviewer"
ADD COLUMN "feishu_open_id" text;
