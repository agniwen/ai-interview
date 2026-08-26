-- 候选人真人复面邀请改为动态展示上一轮通过记录与当前业务轮次。
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
VALUES (
  'system_human_candidate_invitation_candidate_email_v6',
  'system_human_candidate_invitation_candidate_email',
  6,
  'published',
  '{{companyName}} | 在线面试邀请',
  E'{{candidateName}}，您好！\n恭喜您通过第 {{previousRoundNumber}} 轮 {{previousRoundName}}，进入第 {{currentRoundNumber}} 轮 {{roundName}}。\n邀请有效时间：{{invitationStartTime}} 至 {{invitationEndTime}}\n[确认是否参加]({{interviewLink}})\n温馨提示：请在有效期内选择【接受】或【拒绝】，超时邀请自动失效。',
  '["candidateName","companyName","currentRoundNumber","interviewLink","invitationEndTime","invitationStartTime","previousRoundName","previousRoundNumber","roundName"]'::jsonb,
  now()
)
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template"
SET "active_version_id" = 'system_human_candidate_invitation_candidate_email_v6',
    "enabled" = true,
    "updated_at" = now()
WHERE "id" = 'system_human_candidate_invitation_candidate_email';
