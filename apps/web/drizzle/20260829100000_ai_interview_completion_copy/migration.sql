-- AI 面试结束通知根据题目完成度展示自动生成、可手动生成或不可生成状态。
INSERT INTO "interview_notification_template_version" (
  "id",
  "template_id",
  "version",
  "status",
  "subject_template",
  "content_template",
  "variables",
  "published_at"
)
VALUES
  (
    'system_ai_completed_selected_hr_feishu_v3',
    'system_ai_completed_selected_hr_feishu',
    3,
    'published',
    NULL,
    E'{{completionNotice}}\n{{interviewLink}}',
    '["completionNotice","interviewLink"]'::jsonb,
    now()
  ),
  (
    'system_ai_completed_initiator_feishu_v3',
    'system_ai_completed_initiator_feishu',
    3,
    'published',
    NULL,
    E'{{completionNotice}}\n{{interviewLink}}',
    '["completionNotice","interviewLink"]'::jsonb,
    now()
  )
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template"
SET "active_version_id" = CASE "id"
      WHEN 'system_ai_completed_selected_hr_feishu'
        THEN 'system_ai_completed_selected_hr_feishu_v3'
      WHEN 'system_ai_completed_initiator_feishu'
        THEN 'system_ai_completed_initiator_feishu_v3'
    END,
    "enabled" = true,
    "updated_at" = now()
WHERE "id" IN (
  'system_ai_completed_selected_hr_feishu',
  'system_ai_completed_initiator_feishu'
);
