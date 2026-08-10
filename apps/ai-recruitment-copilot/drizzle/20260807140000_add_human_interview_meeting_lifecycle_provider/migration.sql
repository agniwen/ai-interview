ALTER TABLE "studio_human_interview_meeting"
ADD COLUMN "feishu_meeting_id" text,
ADD COLUMN "lifecycle_occurred_at" timestamp with time zone,
ADD COLUMN "lifecycle_source" text;

CREATE INDEX "studio_human_interview_meeting_feishu_meeting_idx"
ON "studio_human_interview_meeting" ("feishu_provider_id", "feishu_meeting_id");

CREATE TABLE "studio_human_interview_meeting_event" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "meeting_id" text NOT NULL REFERENCES "studio_human_interview_meeting"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "type" text NOT NULL
);

CREATE INDEX "studio_human_interview_meeting_event_meeting_idx"
ON "studio_human_interview_meeting_event" ("meeting_id");

CREATE UNIQUE INDEX "studio_human_interview_meeting_event_provider_event_idx"
ON "studio_human_interview_meeting_event" ("provider", "provider_event_id");
