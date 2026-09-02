INSERT INTO "interview_notification_template" (
  "id", "organization_id", "event_type", "audience_type", "channel", "locale", "enabled"
)
VALUES (
  'system_human_evaluation_ready_interviewer_feishu', NULL,
  'human_evaluation_summary_ready', 'meeting_interviewer', 'feishu', 'zh-CN', true
)
ON CONFLICT ("id") DO UPDATE
SET "event_type" = EXCLUDED."event_type",
    "audience_type" = EXCLUDED."audience_type",
    "channel" = EXCLUDED."channel",
    "enabled" = true,
    "updated_at" = now();

INSERT INTO "interview_notification_template_version" (
  "id", "template_id", "version", "status", "subject_template",
  "content_template", "variables", "published_at"
)
VALUES (
  'system_human_evaluation_ready_interviewer_feishu_v1',
  'system_human_evaluation_ready_interviewer_feishu',
  1,
  'published',
  NULL,
  E'{{candidateName}} 的 {{roundName}} AI 评价已生成，请返回招聘系统审核并确认。\n[确认面试评价]({{interviewLink}})\n最终评价以面试官保存的内容为准。',
  '["candidateName","interviewLink","roundName"]'::jsonb,
  now()
)
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template"
SET "active_version_id" = 'system_human_evaluation_ready_interviewer_feishu_v1',
    "enabled" = true,
    "updated_at" = now()
WHERE "id" = 'system_human_evaluation_ready_interviewer_feishu';
