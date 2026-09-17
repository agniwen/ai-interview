UPDATE "human_interview_meeting"
SET "established_at" = "started_at",
    "updated_at" = now()
WHERE "started_at" IS NOT NULL
  AND "established_at" IS NULL;--> statement-breakpoint

UPDATE "human_interview_meeting"
SET "attendance_alerted_at" = COALESCE("attendance_alerted_at", now()),
    "ended_at" = COALESCE("ended_at", "valid_until"),
    "lifecycle_occurred_at" = COALESCE("lifecycle_occurred_at", "valid_until"),
    "lifecycle_source" = COALESCE("lifecycle_source", 'manual'),
    "status" = 'not_held',
    "updated_at" = now()
WHERE "status" IN ('scheduled', 'in_progress')
  AND "started_at" IS NULL
  AND "established_at" IS NULL
  AND "valid_until" IS NOT NULL
  AND "valid_until" <= now();--> statement-breakpoint

CREATE INDEX "human_interview_meeting_attendance_expiry_idx" ON "human_interview_meeting" ("status","valid_until") WHERE "established_at" IS NULL;--> statement-breakpoint
CREATE INDEX "human_interview_meeting_attendance_late_idx" ON "human_interview_meeting" ("status","scheduled_at") WHERE "attendance_alerted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "human_interview_meeting_cancelled_feishu_retry_idx" ON "human_interview_meeting" ("feishu_sync_status","updated_at") WHERE "status" = 'cancelled' AND "feishu_provider_id" IS NOT NULL;
