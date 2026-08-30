CREATE TEMP TABLE "_interview_notification_template_refresh" (
  "template_id" text PRIMARY KEY,
  "event_type" text NOT NULL,
  "audience_type" text NOT NULL,
  "channel" text NOT NULL,
  "subject_template" text,
  "content_template" text NOT NULL,
  "variables" jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO "_interview_notification_template_refresh"
  ("template_id", "event_type", "audience_type", "channel", "subject_template", "content_template", "variables")
VALUES
  ('system_ai_invited_candidate_email', 'ai_interview_invited', 'candidate', 'email', '{{companyName}} | AI 面试邀请', '{{candidateName}}，你好。你的 AI 面试已准备好，请通过以下链接确认并参加面试：{{interviewLink}}。如有问题请联系 {{supportContact}}。', '["candidateName","companyName","interviewLink","supportContact"]'::jsonb),
  ('system_ai_reminder_candidate_email', 'ai_interview_reminder', 'candidate', 'email', '{{companyName}} | AI 面试提醒', '{{candidateName}}，你好。你的 AI 面试将于 {{interviewStartTime}} 开始，请提前通过以下链接进入：{{interviewLink}}。', '["candidateName","companyName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_ai_report_selected_hr_feishu', 'ai_report_ready', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}', '["candidateName","interviewLink","jobName"]'::jsonb),
  ('system_ai_report_initiator_feishu', 'ai_report_ready', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}', '["candidateName","interviewLink","jobName"]'::jsonb),
  ('system_ai_report_initiator_email', 'ai_report_ready', 'initiator_fallback', 'email', '{{candidateName}} 的 AI 面试报告已生成', '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；详情：{{interviewLink}}', '["candidateName","interviewLink","jobName"]'::jsonb),
  ('system_ai_accepted_selected_hr_feishu', 'ai_invitation_accepted', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 已接受 AI 面试邀请。', '["candidateName"]'::jsonb),
  ('system_ai_accepted_initiator_feishu', 'ai_invitation_accepted', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 已接受 AI 面试邀请。', '["candidateName"]'::jsonb),
  ('system_ai_declined_selected_hr_feishu', 'ai_invitation_declined', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 已拒绝 AI 面试邀请，请及时跟进。', '["candidateName"]'::jsonb),
  ('system_ai_declined_initiator_feishu', 'ai_invitation_declined', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 已拒绝 AI 面试邀请，请及时跟进。', '["candidateName"]'::jsonb),
  ('system_ai_completed_selected_hr_feishu', 'ai_interview_completed', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 已完成 AI 面试，报告生成后将另行通知。', '["candidateName"]'::jsonb),
  ('system_ai_completed_initiator_feishu', 'ai_interview_completed', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 已完成 AI 面试，报告生成后将另行通知。', '["candidateName"]'::jsonb),

  ('system_human_candidate_invitation_candidate_email', 'human_candidate_invitation_requested', 'candidate', 'email', '{{companyName}} | 真人面试邀请', '{{candidateName}}，你好。应聘岗位：{{jobName}}；面试时间：{{interviewStartTime}}。请通过以下链接确认是否参加：{{interviewLink}}。', '["candidateName","companyName","interviewLink","interviewStartTime","jobName"]'::jsonb),
  ('system_human_confirmation_requested_interviewer_feishu', 'human_interviewer_confirmation_requested', 'meeting_interviewer', 'feishu', NULL, '候选人已接受面试邀请。候选人：{{candidateName}}；应聘岗位：{{jobName}}；面试时间：{{interviewStartTime}}。请确认是否参加：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime","jobName"]'::jsonb),
  ('system_human_confirmation_requested_interviewer_email', 'human_interviewer_confirmation_requested', 'meeting_interviewer', 'email', '{{candidateName}} | 面试安排待确认', '候选人已接受面试邀请。候选人：{{candidateName}}；应聘岗位：{{jobName}}；面试时间：{{interviewStartTime}}。请确认是否参加：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime","jobName"]'::jsonb),

  ('system_human_accepted_selected_hr_feishu', 'human_invitation_accepted', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 已确认参加面试。应聘岗位：{{jobName}}；面试时间：{{interviewStartTime}}；面试官：{{interviewerNames}}。系统正在等待全部面试官确认。', '["candidateName","interviewStartTime","interviewerNames","jobName"]'::jsonb),
  ('system_human_accepted_initiator_feishu', 'human_invitation_accepted', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 已确认参加面试。应聘岗位：{{jobName}}；面试时间：{{interviewStartTime}}；面试官：{{interviewerNames}}。系统正在等待全部面试官确认。', '["candidateName","interviewStartTime","interviewerNames","jobName"]'::jsonb),
  ('system_human_declined_selected_hr_feishu', 'human_invitation_declined', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 已拒绝参加面试，请及时跟进。', '["candidateName"]'::jsonb),
  ('system_human_declined_initiator_feishu', 'human_invitation_declined', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 已拒绝参加面试，请及时跟进。', '["candidateName"]'::jsonb),

  ('system_human_interviewer_confirmed_selected_hr_feishu', 'human_interviewer_confirmed', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的面试已有面试官确认当前时间，系统将继续等待其他参与人确认。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_confirmed_initiator_feishu', 'human_interviewer_confirmed', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的面试已有面试官确认当前时间，系统将继续等待其他参与人确认。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_confirmed_selected_hr_email', 'human_interviewer_confirmed', 'selected_hr_user', 'email', '{{candidateName}} | 面试官已确认', '{{candidateName}} 的面试已有面试官确认当前时间，系统将继续等待其他参与人确认。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_confirmed_initiator_email', 'human_interviewer_confirmed', 'initiator_fallback', 'email', '{{candidateName}} | 面试官已确认', '{{candidateName}} 的面试已有面试官确认当前时间，系统将继续等待其他参与人确认。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_declined_selected_hr_feishu', 'human_interviewer_declined', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的面试有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_declined_initiator_feishu', 'human_interviewer_declined', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的面试有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_declined_selected_hr_email', 'human_interviewer_declined', 'selected_hr_user', 'email', '{{candidateName}} | 面试官无法参加', '{{candidateName}} 的面试有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_declined_initiator_email', 'human_interviewer_declined', 'initiator_fallback', 'email', '{{candidateName}} | 面试官无法参加', '{{candidateName}} 的面试有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName"]'::jsonb),

  ('system_human_confirmed_candidate_email', 'human_interview_confirmed', 'candidate', 'email', '{{companyName}} | 面试安排确认', '{{candidateName}}，你好。你的面试已安排在 {{interviewStartTime}}，面试官：{{interviewerNames}}，面试入口：{{interviewLink}}。', '["candidateName","companyName","interviewLink","interviewStartTime","interviewerNames"]'::jsonb),
  ('system_human_confirmed_interviewer_feishu', 'human_interview_confirmed', 'meeting_interviewer', 'feishu', NULL, '{{candidateName}} 的面试安排已由候选人和全部面试官确认。时间：{{interviewStartTime}}；入口：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_human_confirmed_interviewer_email', 'human_interview_confirmed', 'meeting_interviewer', 'email', '{{candidateName}} | 面试安排确认', '{{candidateName}} 的面试安排已由候选人和全部面试官确认。时间：{{interviewStartTime}}；入口：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_human_confirmed_selected_hr_feishu', 'human_interview_confirmed', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的面试安排已由候选人和全部面试官确认。时间：{{interviewStartTime}}；面试官：{{interviewerNames}}。', '["candidateName","interviewStartTime","interviewerNames"]'::jsonb),
  ('system_human_confirmed_initiator_feishu', 'human_interview_confirmed', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的面试安排已由候选人和全部面试官确认。时间：{{interviewStartTime}}；面试官：{{interviewerNames}}。', '["candidateName","interviewStartTime","interviewerNames"]'::jsonb),

  ('system_human_rescheduled_candidate_email', 'human_interview_rescheduled', 'candidate', 'email', '{{companyName}} | 面试改期通知', '{{candidateName}}，你好。你的面试已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，面试入口：{{interviewLink}}。变更原因：{{changeReason}}', '["candidateName","changeReason","companyName","interviewLink","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_interviewer_feishu', 'human_interview_rescheduled', 'meeting_interviewer', 'feishu', NULL, '{{candidateName}} 的面试已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，请重新确认。变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_interviewer_email', 'human_interview_rescheduled', 'meeting_interviewer', 'email', '{{candidateName}} | 面试改期通知', '{{candidateName}} 的面试已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，请重新确认：{{interviewLink}}。变更原因：{{changeReason}}', '["candidateName","changeReason","interviewLink","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_selected_hr_feishu', 'human_interview_rescheduled', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的面试已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}。变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","oldInterviewStartTime"]'::jsonb),
  ('system_human_rescheduled_initiator_feishu', 'human_interview_rescheduled', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的面试已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}。变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","oldInterviewStartTime"]'::jsonb),

  ('system_human_cancelled_candidate_email', 'human_interview_cancelled', 'candidate', 'email', '{{companyName}} | 面试取消通知', '{{candidateName}}，你好。原定于 {{interviewStartTime}} 的面试已取消。原因：{{changeReason}}', '["candidateName","changeReason","companyName","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_interviewer_feishu', 'human_interview_cancelled', 'meeting_interviewer', 'feishu', NULL, '{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_interviewer_email', 'human_interview_cancelled', 'meeting_interviewer', 'email', '{{candidateName}} | 面试取消通知', '{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_selected_hr_feishu', 'human_interview_cancelled', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),
  ('system_human_cancelled_initiator_feishu', 'human_interview_cancelled', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 原定于 {{interviewStartTime}} 的面试已取消。原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime"]'::jsonb),

  ('system_human_reminder_candidate_email', 'human_interview_reminder', 'candidate', 'email', '{{companyName}} | 面试即将开始提醒', '{{candidateName}}，你好。你的面试将于 {{interviewStartTime}} 开始，请提前进入：{{interviewLink}}。', '["candidateName","companyName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_human_reminder_interviewer_feishu', 'human_interview_reminder', 'meeting_interviewer', 'feishu', NULL, '{{candidateName}} 的面试将于 {{interviewStartTime}} 开始，请提前进入：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_human_reminder_interviewer_email', 'human_interview_reminder', 'meeting_interviewer', 'email', '{{candidateName}} | 面试即将开始提醒', '{{candidateName}} 的面试将于 {{interviewStartTime}} 开始，请提前进入：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime"]'::jsonb),
  ('system_human_reminder_selected_hr_feishu', 'human_interview_reminder', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的面试将于 {{interviewStartTime}} 开始。', '["candidateName","interviewStartTime"]'::jsonb),
  ('system_human_reminder_initiator_feishu', 'human_interview_reminder', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的面试将于 {{interviewStartTime}} 开始。', '["candidateName","interviewStartTime"]'::jsonb),

  ('system_human_completed_selected_hr_feishu', 'human_interview_completed', 'selected_hr_user', 'feishu', NULL, '{{candidateName}} 的真人面试已结束，请前往招聘系统继续处理评价和后续流程。', '["candidateName"]'::jsonb),
  ('system_human_completed_initiator_feishu', 'human_interview_completed', 'initiator_fallback', 'feishu', NULL, '{{candidateName}} 的真人面试已结束，请前往招聘系统继续处理评价和后续流程。', '["candidateName"]'::jsonb),
  ('system_human_interviewer_added_selected_hr_feishu', 'human_interviewer_added', 'selected_hr_user', 'feishu', NULL, '{{interviewerNames}} 已接受 {{candidateName}} 的面试官邀请。', '["candidateName","interviewerNames"]'::jsonb),
  ('system_human_interviewer_added_initiator_feishu', 'human_interviewer_added', 'initiator_fallback', 'feishu', NULL, '{{interviewerNames}} 已接受 {{candidateName}} 的面试官邀请。', '["candidateName","interviewerNames"]'::jsonb);

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale", "enabled")
SELECT
  "template_id", NULL, "event_type", "audience_type", "channel", 'zh-CN', true
FROM "_interview_notification_template_refresh"
ON CONFLICT ("id") DO UPDATE
SET "event_type" = EXCLUDED."event_type",
    "audience_type" = EXCLUDED."audience_type",
    "channel" = EXCLUDED."channel",
    "enabled" = true,
    "updated_at" = now();

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
SELECT
  "template_id" || '_v2',
  "template_id",
  2,
  'published',
  "subject_template",
  "content_template",
  "variables",
  now()
FROM "_interview_notification_template_refresh"
ON CONFLICT ("template_id", "version") DO UPDATE
SET "status" = EXCLUDED."status",
    "subject_template" = EXCLUDED."subject_template",
    "content_template" = EXCLUDED."content_template",
    "variables" = EXCLUDED."variables",
    "published_at" = EXCLUDED."published_at";

UPDATE "interview_notification_template" AS "template"
SET "active_version_id" = "template"."id" || '_v2',
    "updated_at" = now()
WHERE EXISTS (
  SELECT 1
  FROM "_interview_notification_template_refresh" AS "refresh"
  WHERE "refresh"."template_id" = "template"."id"
);

UPDATE "interview_notification_template"
SET "enabled" = false,
    "updated_at" = now()
WHERE "id" = 'system_human_confirmation_requested_candidate_email';

DROP TABLE "_interview_notification_template_refresh";
