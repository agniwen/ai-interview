-- Data-only migration: publish HR Feishu alerts for AI invitation acceptance failures.
INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  (
    'system_ai_invitation_exception_selected_hr_feishu',
    NULL,
    'ai_invitation_exception',
    'selected_hr_user',
    'feishu',
    'zh-CN'
  ),
  (
    'system_ai_invitation_exception_initiator_feishu',
    NULL,
    'ai_invitation_exception',
    'initiator_fallback',
    'feishu',
    'zh-CN'
  )
ON CONFLICT ("id") DO UPDATE
SET "enabled" = true,
    "updated_at" = now();

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  (
    'system_ai_invitation_exception_selected_hr_feishu_v1',
    'system_ai_invitation_exception_selected_hr_feishu',
    1,
    'published',
    NULL,
    E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}',
    '["candidateName","exceptionType","jobName","occurredAt","suggestedAction"]'::jsonb,
    now()
  ),
  (
    'system_ai_invitation_exception_initiator_feishu_v1',
    'system_ai_invitation_exception_initiator_feishu',
    1,
    'published',
    NULL,
    E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}',
    '["candidateName","exceptionType","jobName","occurredAt","suggestedAction"]'::jsonb,
    now()
  )
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template"
SET "active_version_id" = "id" || '_v1',
    "updated_at" = now()
WHERE "id" IN (
  'system_ai_invitation_exception_selected_hr_feishu',
  'system_ai_invitation_exception_initiator_feishu'
);
