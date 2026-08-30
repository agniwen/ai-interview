-- 真人面试对外通知统一文案：候选人侧不展示面试官、内部状态或内部变更原因。
-- 取消、改期、提醒继续同时覆盖候选人、会议面试官和会议创建者。
CREATE TEMP TABLE "_human_external_notification_templates" (
  "template_id" text PRIMARY KEY,
  "subject_template" text,
  "content_template" text NOT NULL,
  "variables" jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO "_human_external_notification_templates"
  ("template_id", "subject_template", "content_template", "variables")
VALUES
  ('system_human_confirmed_candidate_email', '{{companyName}} | 面试安排确认', E'{{candidateName}}，您好！\n您已确认参加本次面试。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前调试麦克风、摄像头等设备，准时进入会议。', '["candidateName","companyName","interviewLink","interviewStartTime"]'::jsonb),

  ('system_human_rescheduled_candidate_email', '{{companyName}} | 面试改期通知', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})', '["candidateName","companyName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb),
  ('system_human_rescheduled_interviewer_feishu', NULL, E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})', '["candidateName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb),
  ('system_human_rescheduled_interviewer_email', '{{candidateName}} | 面试改期通知', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})', '["candidateName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb),
  ('system_human_rescheduled_initiator_feishu', NULL, E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})', '["candidateName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb),
  ('system_human_rescheduled_initiator_email', '{{candidateName}} | 面试时间已调整', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})', '["candidateName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb),

  ('system_human_cancelled_candidate_email', '{{companyName}} | 面试安排已取消', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}', '["candidateName","companyName","interviewStartTime","roundName"]'::jsonb),
  ('system_human_cancelled_interviewer_feishu', NULL, E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}', '["candidateName","interviewStartTime","roundName"]'::jsonb),
  ('system_human_cancelled_interviewer_email', '{{candidateName}} | 面试安排已取消', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}', '["candidateName","interviewStartTime","roundName"]'::jsonb),
  ('system_human_cancelled_initiator_feishu', NULL, E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}', '["candidateName","interviewStartTime","roundName"]'::jsonb),
  ('system_human_cancelled_initiator_email', '{{candidateName}} | 面试安排已取消', E'候选人：{{candidateName}}\n面试轮次：{{roundName}}\n原面试时间：{{interviewStartTime}}', '["candidateName","interviewStartTime","roundName"]'::jsonb),

  ('system_human_reminder_candidate_email', '{{companyName}} | 面试即将开始提醒', E'{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。', '["candidateName","companyName","interviewLink","interviewStartTime","reminderLeadTime","roundName"]'::jsonb),
  ('system_human_reminder_interviewer_feishu', NULL, E'{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime","roundName"]'::jsonb),
  ('system_human_reminder_interviewer_email', '{{candidateName}} | 面试即将开始提醒', E'{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime","roundName"]'::jsonb),
  ('system_human_reminder_initiator_feishu', NULL, E'{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime","roundName"]'::jsonb),
  ('system_human_reminder_initiator_email', '{{candidateName}} | 面试即将开始提醒', E'{{candidateName}} 的 {{roundName}} 将在 {{reminderLeadTime}} 后启动。\n面试轮次：{{roundName}}\n正式面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})\n温馨提示：请提前调试麦克风、摄像头等设备，准时进入线上会议室。', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime","roundName"]'::jsonb);

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
SELECT
  "template_id" || '_v5',
  "template_id",
  5,
  'published',
  "subject_template",
  "content_template",
  "variables",
  now()
FROM "_human_external_notification_templates"
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template" AS "template"
SET "active_version_id" = "template"."id" || '_v5',
    "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "_human_external_notification_templates" AS "refresh"
  WHERE "refresh"."template_id" = "template"."id"
);

DROP TABLE "_human_external_notification_templates";
