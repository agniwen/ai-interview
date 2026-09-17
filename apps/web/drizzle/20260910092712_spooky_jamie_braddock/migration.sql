ALTER TABLE "human_interview_meeting" ADD COLUMN "attendance_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "human_interview_meeting" ADD COLUMN "established_at" timestamp with time zone;--> statement-breakpoint

UPDATE "human_interview_meeting"
SET "established_at" = "started_at"
WHERE "status" = 'ended' AND "started_at" IS NOT NULL AND "established_at" IS NULL;--> statement-breakpoint

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  (
    'system_human_attendance_alert_initiator_feishu',
    NULL,
    'human_interview_attendance_alert',
    'initiator_fallback',
    'feishu',
    'zh-CN'
  ),
  (
    'system_human_not_held_initiator_feishu',
    NULL,
    'human_interview_not_held',
    'initiator_fallback',
    'feishu',
    'zh-CN'
  )
ON CONFLICT ("id") DO UPDATE
SET "enabled" = true,
    "updated_at" = now();--> statement-breakpoint

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  (
    'system_human_attendance_alert_initiator_feishu_v1',
    'system_human_attendance_alert_initiator_feishu',
    1,
    'published',
    NULL,
    E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n面试轮次：{{roundName}}\n面试时间：{{interviewStartTime}}\n当前状态：{{attendanceStatus}}\n未入会人员：{{missingParticipantNames}}\n处理建议：{{suggestedAction}}\n[查看实时参会状态]({{interviewLink}})',
    '["attendanceStatus","candidateName","interviewLink","interviewStartTime","jobName","missingParticipantNames","roundName","suggestedAction"]'::jsonb,
    now()
  ),
  (
    'system_human_not_held_initiator_feishu_v1',
    'system_human_not_held_initiator_feishu',
    1,
    'published',
    NULL,
    E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n面试轮次：{{roundName}}\n有效时间：{{interviewStartTime}} 至 {{interviewEndTime}}\n当前状态：未召开\n未入会人员：{{missingParticipantNames}}\n处理建议：{{suggestedAction}}\n[查看面试记录]({{interviewLink}})',
    '["candidateName","interviewEndTime","interviewLink","interviewStartTime","jobName","missingParticipantNames","roundName","suggestedAction"]'::jsonb,
    now()
  )
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";--> statement-breakpoint

UPDATE "interview_notification_template"
SET "active_version_id" = "id" || '_v1',
    "updated_at" = now()
WHERE "id" IN (
  'system_human_attendance_alert_initiator_feishu',
  'system_human_not_held_initiator_feishu'
);
