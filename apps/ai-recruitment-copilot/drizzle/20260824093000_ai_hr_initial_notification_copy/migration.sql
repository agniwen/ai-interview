CREATE TEMP TABLE "_ai_hr_initial_notification_template_refresh" (
  "template_id" text PRIMARY KEY,
  "subject_template" text,
  "content_template" text NOT NULL,
  "variables" jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO "_ai_hr_initial_notification_template_refresh"
  ("template_id", "subject_template", "content_template", "variables")
VALUES
  (
    'system_ai_invited_candidate_email',
    '{{companyName}} | 在线面试邀请',
    E'{{candidateName}}，您好！\n您投递应聘的 {{jobName}} 简历已筛选通过，正式进入第一轮 HR 初面环节。\n邀请有效时间：{{invitationStartTime}} 至 {{invitationEndTime}}\n[确认并进入面试]({{interviewLink}})\n温馨提示：请在有效期内点击链接选择【接受】或【拒绝】面试安排；邀请超时将自动失效。',
    '["candidateName","companyName","interviewLink","invitationEndTime","invitationStartTime","jobName"]'::jsonb
  ),
  (
    'system_ai_accepted_selected_hr_feishu',
    NULL,
    E'候选人：{{candidateName}}\n状态：接受 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，等待面试开展。',
    '["candidateName","jobName","responseTime"]'::jsonb
  ),
  (
    'system_ai_accepted_initiator_feishu',
    NULL,
    E'候选人：{{candidateName}}\n状态：接受 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，等待面试开展。',
    '["candidateName","jobName","responseTime"]'::jsonb
  ),
  (
    'system_ai_declined_selected_hr_feishu',
    NULL,
    E'候选人：{{candidateName}}\n状态：拒绝 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人主动放弃本轮面试，面试流程终止。',
    '["candidateName","jobName","responseTime"]'::jsonb
  ),
  (
    'system_ai_declined_initiator_feishu',
    NULL,
    E'候选人：{{candidateName}}\n状态：拒绝 第一轮 HR 面试\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人主动放弃本轮面试，面试流程终止。',
    '["candidateName","jobName","responseTime"]'::jsonb
  );

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
SELECT
  "template_id" || '_v3',
  "template_id",
  3,
  'published',
  "subject_template",
  "content_template",
  "variables",
  now()
FROM "_ai_hr_initial_notification_template_refresh"
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template" AS "template"
SET "active_version_id" = "template"."id" || '_v3',
    "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "_ai_hr_initial_notification_template_refresh" AS "refresh"
  WHERE "refresh"."template_id" = "template"."id"
);

DROP TABLE "_ai_hr_initial_notification_template_refresh";
