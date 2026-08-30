-- Data-only migration: notify the candidate by email when an AI invitation response fails.
INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  (
    'system_ai_invitation_exception_candidate_email',
    NULL,
    'ai_invitation_exception',
    'candidate',
    'email',
    'zh-CN'
  )
ON CONFLICT ("id") DO UPDATE
SET "enabled" = true,
    "updated_at" = now();

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  (
    'system_ai_invitation_exception_candidate_email_v1',
    'system_ai_invitation_exception_candidate_email',
    1,
    'published',
    '{{companyName}} | 接受面试异常',
    E'{{candidateName}}，您好！\n暂时无法完成您的面试确认操作，请稍后重新尝试。\n异常情况：{{exceptionType}}\n发生时间：{{occurredAt}}\n若面试邀请已过期失效，或您需要调整之前的确认结果，请联系招聘负责人协调重新发起邀请。',
    '["candidateName","companyName","exceptionType","occurredAt"]'::jsonb,
    now()
  )
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template"
SET "active_version_id" = 'system_ai_invitation_exception_candidate_email_v1',
    "updated_at" = now()
WHERE "id" = 'system_ai_invitation_exception_candidate_email';
