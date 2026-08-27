-- 真人面试第一版：HR 保存即代表面试官时间已协调，候选人接受后直接确认。
-- 真人面试 HR 接收人统一为会议 created_by，不再使用额外选择的通知人员。
UPDATE "interview_notification_template"
SET "enabled" = false,
    "updated_at" = now()
WHERE "event_type" LIKE 'human_%'
  AND "audience_type" = 'selected_hr_user';

UPDATE "interview_notification_template"
SET "enabled" = false,
    "updated_at" = now()
WHERE "event_type" IN (
  'human_interviewer_confirmation_requested',
  'human_interviewer_confirmed',
  'human_interviewer_declined'
);

CREATE TEMP TABLE "_human_direct_confirmation_templates" (
  "template_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "audience_type" text NOT NULL,
  "channel" text NOT NULL,
  "subject_template" text,
  "content_template" text NOT NULL,
  "variables" jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO "_human_direct_confirmation_templates"
  ("template_id", "event_type", "audience_type", "channel", "subject_template", "content_template", "variables")
VALUES
  ('system_human_candidate_invitation_candidate_email', 'human_candidate_invitation_requested', 'candidate', 'email', '{{companyName}} | 在线面试邀请', E'{{candidateName}}，您好！\n恭喜您通过第一轮 HR 初面，进入{{roundName}}。\n邀请有效时间：{{invitationStartTime}} 至 {{invitationEndTime}}\n[确认是否参加]({{interviewLink}})\n温馨提示：请在有效期内选择【接受】或【拒绝】，超时邀请自动失效。', '["candidateName","companyName","interviewLink","invitationEndTime","invitationStartTime","roundName"]'::jsonb),

  ('system_human_accepted_initiator_feishu', 'human_invitation_accepted', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n状态：接受 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，面试安排已生效，并已通知面试官。', '["candidateName","jobName","responseTime","roundName"]'::jsonb),
  ('system_human_accepted_initiator_email', 'human_invitation_accepted', 'initiator_fallback', 'email', '{{candidateName}} | 候选人已确认面试', E'候选人：{{candidateName}}\n状态：接受 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人已确认参与面试，面试安排已生效，并已通知面试官。', '["candidateName","jobName","responseTime","roundName"]'::jsonb),
  ('system_human_declined_initiator_feishu', 'human_invitation_declined', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n状态：拒绝 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人拒绝本次面试，请及时联系并跟进。', '["candidateName","jobName","responseTime","roundName"]'::jsonb),
  ('system_human_declined_initiator_email', 'human_invitation_declined', 'initiator_fallback', 'email', '{{candidateName}} | 候选人已拒绝面试', E'候选人：{{candidateName}}\n状态：拒绝 {{roundName}}\n应聘岗位：{{jobName}}\n反馈时间：{{responseTime}}\n后续指引：候选人拒绝本次面试，请及时联系并跟进。', '["candidateName","jobName","responseTime","roundName"]'::jsonb),

  ('system_human_confirmed_candidate_email', 'human_interview_confirmed', 'candidate', 'email', '{{companyName}} | 面试安排确认', E'{{candidateName}}，您好！\n您已确认参加本次面试。\n面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n[进入在线面试]({{interviewLink}})\n请提前调试麦克风、摄像头等设备，准时进入会议。', '["candidateName","companyName","interviewLink","interviewStartTime","interviewerNames"]'::jsonb),
  ('system_human_confirmed_interviewer_feishu', 'human_interview_confirmed', 'meeting_interviewer', 'feishu', NULL, E'业务复试安排已确认。\n候选人：{{candidateName}}\n面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n[进入在线面试]({{interviewLink}})\n请提前预留时间，准时参与面试。', '["candidateName","interviewLink","interviewStartTime","interviewerNames"]'::jsonb),
  ('system_human_confirmed_interviewer_email', 'human_interview_confirmed', 'meeting_interviewer', 'email', '{{candidateName}} | 面试安排确认', E'你已被安排参加 {{candidateName}} 的面试。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前预留时间，准时参与面试。', '["candidateName","interviewLink","interviewStartTime"]'::jsonb),

  ('system_human_rescheduled_candidate_email', 'human_interview_rescheduled', 'candidate', 'email', '{{companyName}} | 面试改期通知', E'{{candidateName}}，您好！\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n变更原因：{{changeReason}}', '["candidateName","changeReason","companyName","interviewLink","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_interviewer_feishu', 'human_interview_rescheduled', 'meeting_interviewer', 'feishu', NULL, E'{{candidateName}} 的面试时间已调整。\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n变更原因：{{changeReason}}\n[查看面试安排]({{interviewLink}})', '["candidateName","changeReason","interviewLink","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_interviewer_email', 'human_interview_rescheduled', 'meeting_interviewer', 'email', '{{candidateName}} | 面试改期通知', E'{{candidateName}} 的面试时间已调整。\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n[查看面试安排]({{interviewLink}})\n变更原因：{{changeReason}}', '["candidateName","changeReason","interviewLink","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_initiator_feishu', 'human_interview_rescheduled', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","interviewerNames","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_initiator_email', 'human_interview_rescheduled', 'initiator_fallback', 'email', '{{candidateName}} | 面试时间已调整', E'候选人：{{candidateName}}\n原面试时间：{{oldInterviewStartTime}}\n新面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","interviewerNames","oldInterviewStartTime"]'::jsonb),

  ('system_human_cancelled_candidate_email', 'human_interview_cancelled', 'candidate', 'email', '{{companyName}} | 面试安排已取消', E'{{candidateName}}，您好！原定于 {{interviewStartTime}} 的面试已取消。\n取消原因：{{changeReason}}', '["candidateName","changeReason","companyName","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_interviewer_feishu', 'human_interview_cancelled', 'meeting_interviewer', 'feishu', NULL, E'{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。\n取消原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_interviewer_email', 'human_interview_cancelled', 'meeting_interviewer', 'email', '{{candidateName}} | 面试安排已取消', E'{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。\n取消原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_initiator_feishu', 'human_interview_cancelled', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n原面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n取消原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","interviewerNames"]'::jsonb),
  ('system_human_cancelled_initiator_email', 'human_interview_cancelled', 'initiator_fallback', 'email', '{{candidateName}} | 面试安排已取消', E'候选人：{{candidateName}}\n原面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}\n取消原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","interviewerNames"]'::jsonb),

  ('system_human_reminder_candidate_email', 'human_interview_reminder', 'candidate', 'email', '{{companyName}} | 面试即将开始提醒', E'{{candidateName}}，您好！您的面试将在 {{reminderLeadTime}} 后开始。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前调试麦克风、摄像头等设备。', '["candidateName","companyName","interviewLink","interviewStartTime","reminderLeadTime"]'::jsonb),
  ('system_human_reminder_interviewer_feishu', 'human_interview_reminder', 'meeting_interviewer', 'feishu', NULL, E'{{candidateName}} 的面试将在 {{reminderLeadTime}} 后开始。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})\n请提前调试麦克风、摄像头等设备。', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime"]'::jsonb),
  ('system_human_reminder_interviewer_email', 'human_interview_reminder', 'meeting_interviewer', 'email', '{{candidateName}} | 面试即将开始提醒', E'{{candidateName}} 的面试将在 {{reminderLeadTime}} 后开始。\n面试时间：{{interviewStartTime}}\n[进入在线面试]({{interviewLink}})', '["candidateName","interviewLink","interviewStartTime","reminderLeadTime"]'::jsonb),
  ('system_human_reminder_initiator_feishu', 'human_interview_reminder', 'initiator_fallback', 'feishu', NULL, E'{{candidateName}} 的面试将在 {{reminderLeadTime}} 后开始。\n面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}', '["candidateName","interviewStartTime","interviewerNames","reminderLeadTime"]'::jsonb),
  ('system_human_reminder_initiator_email', 'human_interview_reminder', 'initiator_fallback', 'email', '{{candidateName}} | 面试即将开始提醒', E'{{candidateName}} 的面试将在 {{reminderLeadTime}} 后开始。\n面试时间：{{interviewStartTime}}\n面试官：{{interviewerNames}}', '["candidateName","interviewStartTime","interviewerNames","reminderLeadTime"]'::jsonb),

  ('system_human_invitation_exception_candidate_email', 'human_invitation_exception', 'candidate', 'email', '{{companyName}} | 接受面试异常', E'{{candidateName}}，您好！\n暂时无法确认您的面试安排，请稍后重试。\n异常情况：{{exceptionType}}\n发生时间：{{occurredAt}}\n如邀请已失效，请联系招聘负责人重新发起邀请。', '["candidateName","companyName","exceptionType","occurredAt"]'::jsonb),
  ('system_human_invitation_exception_initiator_feishu', 'human_invitation_exception', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n面试：{{roundName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}', '["candidateName","exceptionType","occurredAt","roundName","suggestedAction"]'::jsonb),
  ('system_human_invitation_exception_initiator_email', 'human_invitation_exception', 'initiator_fallback', 'email', '{{candidateName}} | 候选人面试接受异常', E'候选人：{{candidateName}}\n面试：{{roundName}}\n异常类型：{{exceptionType}}\n发生时间：{{occurredAt}}\n处理建议：{{suggestedAction}}', '["candidateName","exceptionType","occurredAt","roundName","suggestedAction"]'::jsonb),

  ('system_human_completed_initiator_feishu', 'human_interview_completed', 'initiator_fallback', 'feishu', NULL, E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n面试完成时间：{{completedAt}}\n当前完成面试：{{roundName}}\n\n{{evaluationSummary}}\n\n[前往招聘系统查看完整记录]({{interviewLink}})', '["candidateName","completedAt","evaluationSummary","interviewLink","jobName","roundName"]'::jsonb),
  ('system_human_completed_initiator_email', 'human_interview_completed', 'initiator_fallback', 'email', '{{candidateName}} | 面试评价汇总', E'候选人：{{candidateName}}\n应聘岗位：{{jobName}}\n面试完成时间：{{completedAt}}\n当前完成面试：{{roundName}}\n\n{{evaluationSummary}}\n\n[前往招聘系统查看完整记录]({{interviewLink}})', '["candidateName","completedAt","evaluationSummary","interviewLink","jobName","roundName"]'::jsonb);

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale", "enabled")
SELECT "template_id", NULL, "event_type", "audience_type", "channel", 'zh-CN', true
FROM "_human_direct_confirmation_templates"
ON CONFLICT ("id") DO UPDATE
SET "event_type" = EXCLUDED."event_type",
    "audience_type" = EXCLUDED."audience_type",
    "channel" = EXCLUDED."channel",
    "enabled" = true,
    "updated_at" = now();

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
SELECT
  "template_id" || '_v4',
  "template_id",
  4,
  'published',
  "subject_template",
  "content_template",
  "variables",
  now()
FROM "_human_direct_confirmation_templates"
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template" AS "template"
SET "active_version_id" = "template"."id" || '_v4',
    "enabled" = true,
    "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "_human_direct_confirmation_templates" AS "refresh"
  WHERE "refresh"."template_id" = "template"."id"
);

DROP TABLE "_human_direct_confirmation_templates";
