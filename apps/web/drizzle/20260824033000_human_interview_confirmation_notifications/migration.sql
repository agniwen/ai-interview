INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  ('system_human_confirmation_requested_candidate_email', NULL, 'human_interviewer_confirmation_requested', 'candidate', 'email', 'zh-CN'),
  ('system_human_confirmation_requested_interviewer_feishu', NULL, 'human_interviewer_confirmation_requested', 'meeting_interviewer', 'feishu', 'zh-CN'),
  ('system_human_confirmation_requested_interviewer_email', NULL, 'human_interviewer_confirmation_requested', 'meeting_interviewer', 'email', 'zh-CN'),
  ('system_human_confirmed_interviewer_feishu', NULL, 'human_interview_confirmed', 'meeting_interviewer', 'feishu', 'zh-CN'),
  ('system_human_rescheduled_interviewer_feishu', NULL, 'human_interview_rescheduled', 'meeting_interviewer', 'feishu', 'zh-CN'),
  ('system_human_cancelled_interviewer_feishu', NULL, 'human_interview_cancelled', 'meeting_interviewer', 'feishu', 'zh-CN'),
  ('system_human_interviewer_confirmed_selected_hr_feishu', NULL, 'human_interviewer_confirmed', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_interviewer_confirmed_initiator_feishu', NULL, 'human_interviewer_confirmed', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_interviewer_confirmed_selected_hr_email', NULL, 'human_interviewer_confirmed', 'selected_hr_user', 'email', 'zh-CN'),
  ('system_human_interviewer_confirmed_initiator_email', NULL, 'human_interviewer_confirmed', 'initiator_fallback', 'email', 'zh-CN'),
  ('system_human_interviewer_declined_selected_hr_feishu', NULL, 'human_interviewer_declined', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_interviewer_declined_initiator_feishu', NULL, 'human_interviewer_declined', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_interviewer_declined_selected_hr_email', NULL, 'human_interviewer_declined', 'selected_hr_user', 'email', 'zh-CN'),
  ('system_human_interviewer_declined_initiator_email', NULL, 'human_interviewer_declined', 'initiator_fallback', 'email', 'zh-CN')
ON CONFLICT DO NOTHING;

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  ('system_human_confirmation_requested_candidate_email_v1', 'system_human_confirmation_requested_candidate_email', 1, 'published', '{{companyName}} | {{roundName}} 待确认', '{{candidateName}}，你好。你的 {{roundName}} 暂定于 {{interviewStartTime}}，请通过以下链接确认是否参加：{{interviewLink}}。', '["candidateName","companyName","interviewLink","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_confirmation_requested_interviewer_feishu_v1', 'system_human_confirmation_requested_interviewer_feishu', 1, 'published', NULL, '请确认 {{candidateName}} 的 {{roundName}} 面试安排，时间：{{interviewStartTime}}，入口：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_confirmation_requested_interviewer_email_v1', 'system_human_confirmation_requested_interviewer_email', 1, 'published', '{{candidateName}} | {{roundName}} 待确认', '请确认 {{candidateName}} 的 {{roundName}} 面试安排，时间：{{interviewStartTime}}，入口：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_confirmed_interviewer_feishu_v1', 'system_human_confirmed_interviewer_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 安排已由候选人和全部面试官确认，时间：{{interviewStartTime}}，入口：{{interviewLink}}。', '["candidateName","interviewLink","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_rescheduled_interviewer_feishu_v1', 'system_human_rescheduled_interviewer_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，请重新确认。变更原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_cancelled_interviewer_feishu_v1', 'system_human_cancelled_interviewer_feishu', 1, 'published', NULL, '{{candidateName}} 原定于 {{interviewStartTime}} 的 {{roundName}} 已取消。原因：{{changeReason}}', '["candidateName","changeReason","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_interviewer_confirmed_selected_hr_feishu_v1', 'system_human_interviewer_confirmed_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 有面试官已确认当前时间，等待其他参与人确认。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_confirmed_initiator_feishu_v1', 'system_human_interviewer_confirmed_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 有面试官已确认当前时间，等待其他参与人确认。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_confirmed_selected_hr_email_v1', 'system_human_interviewer_confirmed_selected_hr_email', 1, 'published', '{{candidateName}} | 面试官已确认', '{{candidateName}} 的 {{roundName}} 有面试官已确认当前时间，等待其他参与人确认。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_confirmed_initiator_email_v1', 'system_human_interviewer_confirmed_initiator_email', 1, 'published', '{{candidateName}} | 面试官已确认', '{{candidateName}} 的 {{roundName}} 有面试官已确认当前时间，等待其他参与人确认。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_declined_selected_hr_feishu_v1', 'system_human_interviewer_declined_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_declined_initiator_feishu_v1', 'system_human_interviewer_declined_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_declined_selected_hr_email_v1', 'system_human_interviewer_declined_selected_hr_email', 1, 'published', '{{candidateName}} | 面试官无法参加', '{{candidateName}} 的 {{roundName}} 有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_declined_initiator_email_v1', 'system_human_interviewer_declined_initiator_email', 1, 'published', '{{candidateName}} | 面试官无法参加', '{{candidateName}} 的 {{roundName}} 有面试官无法参加当前时间，请及时改期或更换面试官。', '["candidateName","roundName"]'::jsonb, now())
ON CONFLICT ("template_id", "version") DO NOTHING;

UPDATE "interview_notification_template"
SET "active_version_id" = "interview_notification_template_version"."id",
    "updated_at" = now()
FROM "interview_notification_template_version"
WHERE "interview_notification_template_version"."template_id" = "interview_notification_template"."id"
  AND "interview_notification_template_version"."version" = 1
  AND "interview_notification_template"."event_type" IN (
    'human_interviewer_confirmation_requested',
    'human_interviewer_confirmed',
    'human_interviewer_declined'
  );
