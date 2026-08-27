ALTER TABLE "studio_interview_schedule"
  ADD COLUMN "candidate_decline_reason" text,
  ADD COLUMN "candidate_invite_expires_at" timestamp with time zone,
  ADD COLUMN "candidate_invite_status" text DEFAULT 'pending' NOT NULL,
  ADD COLUMN "candidate_invite_token_hash" text,
  ADD COLUMN "candidate_responded_at" timestamp with time zone,
  ADD COLUMN "invitation_version" integer DEFAULT 1 NOT NULL,
  ADD CONSTRAINT "studio_interview_schedule_invite_status_check"
    CHECK ("candidate_invite_status" IN ('pending', 'sent', 'accepted', 'declined', 'expired')),
  ADD CONSTRAINT "studio_interview_schedule_invitation_version_check"
    CHECK ("invitation_version" > 0);

CREATE UNIQUE INDEX "studio_interview_schedule_invite_token_uq"
  ON "studio_interview_schedule" ("candidate_invite_token_hash")
  WHERE "candidate_invite_token_hash" IS NOT NULL;

ALTER TABLE "studio_human_interview_meeting"
  ADD COLUMN "schedule_version" integer DEFAULT 1 NOT NULL,
  ADD CONSTRAINT "studio_human_interview_meeting_schedule_version_check"
    CHECK ("schedule_version" > 0);

CREATE UNIQUE INDEX "studio_human_interview_meeting_id_org_uq"
  ON "studio_human_interview_meeting" ("id", "organization_id");

ALTER TABLE "studio_human_interview_meeting_round"
  ADD COLUMN "candidate_decline_reason" text,
  ADD COLUMN "candidate_invite_status" text DEFAULT 'pending' NOT NULL,
  ADD COLUMN "candidate_responded_at" timestamp with time zone,
  ADD COLUMN "invitation_version" integer DEFAULT 1 NOT NULL,
  ADD CONSTRAINT "studio_human_interview_meeting_round_invite_status_check"
    CHECK ("candidate_invite_status" IN ('pending', 'sent', 'accepted', 'declined', 'expired')),
  ADD CONSTRAINT "studio_human_interview_meeting_round_invitation_version_check"
    CHECK ("invitation_version" > 0);

CREATE TABLE "studio_interview_notification_recipient" (
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "interview_record_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  CONSTRAINT "studio_interview_notification_recipient_pk"
    PRIMARY KEY ("interview_record_id", "user_id"),
  CONSTRAINT "studio_interview_notification_recipient_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "studio_interview_notification_recipient_record_fk"
    FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_interview_notification_recipient_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_interview_notification_recipient_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_interview_notification_recipient_record_org_fk"
    FOREIGN KEY ("interview_record_id", "organization_id")
    REFERENCES "studio_interview" ("id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "studio_interview_notification_recipient_member_org_fk"
    FOREIGN KEY ("user_id", "organization_id")
    REFERENCES "member" ("user_id", "organization_id") ON DELETE CASCADE
);

CREATE INDEX "studio_interview_notification_recipient_user_idx"
  ON "studio_interview_notification_recipient" ("organization_id", "user_id");

CREATE TABLE "interview_notification_template" (
  "active_version_id" text,
  "audience_type" text NOT NULL,
  "channel" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "event_type" text NOT NULL,
  "id" text PRIMARY KEY NOT NULL,
  "locale" text DEFAULT 'zh-CN' NOT NULL,
  "organization_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text,
  CONSTRAINT "interview_notification_template_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_template_updated_by_fk"
    FOREIGN KEY ("updated_by") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "interview_notification_template_audience_check"
    CHECK ("audience_type" IN ('candidate', 'selected_hr_user', 'initiator_fallback', 'meeting_interviewer')),
  CONSTRAINT "interview_notification_template_channel_check"
    CHECK ("channel" IN ('feishu', 'email', 'sms'))
);

CREATE UNIQUE INDEX "interview_notification_template_workspace_uq"
  ON "interview_notification_template"
  ("organization_id", "event_type", "audience_type", "channel", "locale")
  WHERE "organization_id" IS NOT NULL;
CREATE UNIQUE INDEX "interview_notification_template_system_uq"
  ON "interview_notification_template" ("event_type", "audience_type", "channel", "locale")
  WHERE "organization_id" IS NULL;
CREATE INDEX "interview_notification_template_org_enabled_idx"
  ON "interview_notification_template" ("organization_id", "enabled");

CREATE TABLE "interview_notification_template_version" (
  "content_template" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  "id" text PRIMARY KEY NOT NULL,
  "published_at" timestamp with time zone,
  "status" text DEFAULT 'draft' NOT NULL,
  "subject_template" text,
  "template_id" text NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "version" integer NOT NULL,
  CONSTRAINT "interview_notification_template_version_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "interview_notification_template_version_template_fk"
    FOREIGN KEY ("template_id") REFERENCES "interview_notification_template" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_template_version_status_check"
    CHECK ("status" IN ('draft', 'published', 'archived')),
  CONSTRAINT "interview_notification_template_version_positive_check"
    CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "interview_notification_template_version_uq"
  ON "interview_notification_template_version" ("template_id", "version");
CREATE INDEX "interview_notification_template_version_status_idx"
  ON "interview_notification_template_version" ("template_id", "status");

ALTER TABLE "interview_notification_template"
  ADD CONSTRAINT "interview_notification_template_active_version_fk"
    FOREIGN KEY ("active_version_id")
    REFERENCES "interview_notification_template_version" ("id") ON DELETE SET NULL;

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  ('system_ai_invited_candidate_email', NULL, 'ai_interview_invited', 'candidate', 'email', 'zh-CN'),
  ('system_ai_reminder_candidate_email', NULL, 'ai_interview_reminder', 'candidate', 'email', 'zh-CN'),
  ('system_ai_report_selected_hr_feishu', NULL, 'ai_report_ready', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_ai_report_initiator_feishu', NULL, 'ai_report_ready', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_ai_report_initiator_email', NULL, 'ai_report_ready', 'initiator_fallback', 'email', 'zh-CN'),
  ('system_human_confirmed_candidate_email', NULL, 'human_interview_confirmed', 'candidate', 'email', 'zh-CN'),
  ('system_human_confirmed_interviewer_email', NULL, 'human_interview_confirmed', 'meeting_interviewer', 'email', 'zh-CN'),
  ('system_human_reminder_candidate_email', NULL, 'human_interview_reminder', 'candidate', 'email', 'zh-CN'),
  ('system_human_reminder_interviewer_email', NULL, 'human_interview_reminder', 'meeting_interviewer', 'email', 'zh-CN'),
  ('system_human_rescheduled_candidate_email', NULL, 'human_interview_rescheduled', 'candidate', 'email', 'zh-CN'),
  ('system_human_rescheduled_interviewer_email', NULL, 'human_interview_rescheduled', 'meeting_interviewer', 'email', 'zh-CN'),
  ('system_human_cancelled_candidate_email', NULL, 'human_interview_cancelled', 'candidate', 'email', 'zh-CN'),
  ('system_human_cancelled_interviewer_email', NULL, 'human_interview_cancelled', 'meeting_interviewer', 'email', 'zh-CN');

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  (
    'system_ai_invited_candidate_email_v1',
    'system_ai_invited_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 面试邀请',
    '{{candidateName}}，你好。你已进入 {{roundName}}，请通过以下链接参加面试：{{interviewLink}}。如有问题请联系 {{supportContact}}。',
    '["candidateName","companyName","interviewLink","roundName","supportContact"]'::jsonb,
    now()
  ),
  (
    'system_ai_reminder_candidate_email_v1',
    'system_ai_reminder_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 面试提醒',
    '{{candidateName}}，你好。你的 {{roundName}} 将于 {{interviewStartTime}} 开始，请提前通过以下链接进入：{{interviewLink}}。',
    '["candidateName","companyName","interviewLink","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_ai_report_selected_hr_feishu_v1',
    'system_ai_report_selected_hr_feishu',
    1,
    'published',
    NULL,
    '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；轮次：{{roundName}}；详情：{{interviewLink}}',
    '["candidateName","interviewLink","jobName","roundName"]'::jsonb,
    now()
  ),
  (
    'system_ai_report_initiator_feishu_v1',
    'system_ai_report_initiator_feishu',
    1,
    'published',
    NULL,
    '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；轮次：{{roundName}}；详情：{{interviewLink}}',
    '["candidateName","interviewLink","jobName","roundName"]'::jsonb,
    now()
  ),
  (
    'system_ai_report_initiator_email_v1',
    'system_ai_report_initiator_email',
    1,
    'published',
    '{{candidateName}} 的 AI 面试报告已生成',
    '{{candidateName}} 的 AI 面试报告已生成。岗位：{{jobName}}；轮次：{{roundName}}；详情：{{interviewLink}}',
    '["candidateName","interviewLink","jobName","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_confirmed_candidate_email_v1',
    'system_human_confirmed_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 安排确认',
    '{{candidateName}}，你好。你的 {{roundName}} 已安排在 {{interviewStartTime}}，面试官：{{interviewerNames}}，面试入口：{{interviewLink}}。',
    '["candidateName","companyName","interviewLink","interviewerNames","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_confirmed_interviewer_email_v1',
    'system_human_confirmed_interviewer_email',
    1,
    'published',
    '{{candidateName}} | {{roundName}} 安排确认',
    '你已被安排参加 {{candidateName}} 的 {{roundName}}，时间：{{interviewStartTime}}，入口：{{interviewLink}}。',
    '["candidateName","interviewLink","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_reminder_candidate_email_v1',
    'system_human_reminder_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 面试提醒',
    '{{candidateName}}，你好。你的 {{roundName}} 将于 {{interviewStartTime}} 开始，面试入口：{{interviewLink}}。',
    '["candidateName","companyName","interviewLink","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_reminder_interviewer_email_v1',
    'system_human_reminder_interviewer_email',
    1,
    'published',
    '{{candidateName}} | {{roundName}} 面试提醒',
    '{{candidateName}} 的 {{roundName}} 将于 {{interviewStartTime}} 开始，面试入口：{{interviewLink}}。',
    '["candidateName","interviewLink","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_rescheduled_candidate_email_v1',
    'system_human_rescheduled_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 改期通知',
    '{{candidateName}}，你好。你的 {{roundName}} 已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，面试入口：{{interviewLink}}。变更原因：{{changeReason}}',
    '["candidateName","changeReason","companyName","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_rescheduled_interviewer_email_v1',
    'system_human_rescheduled_interviewer_email',
    1,
    'published',
    '{{candidateName}} | {{roundName}} 改期通知',
    '{{candidateName}} 的 {{roundName}} 已从 {{oldInterviewStartTime}} 调整为 {{interviewStartTime}}，入口：{{interviewLink}}。变更原因：{{changeReason}}',
    '["candidateName","changeReason","interviewLink","interviewStartTime","oldInterviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_cancelled_candidate_email_v1',
    'system_human_cancelled_candidate_email',
    1,
    'published',
    '{{companyName}} | {{roundName}} 取消通知',
    '{{candidateName}}，你好。原定于 {{interviewStartTime}} 的 {{roundName}} 已取消。原因：{{changeReason}}',
    '["candidateName","changeReason","companyName","interviewStartTime","roundName"]'::jsonb,
    now()
  ),
  (
    'system_human_cancelled_interviewer_email_v1',
    'system_human_cancelled_interviewer_email',
    1,
    'published',
    '{{candidateName}} | {{roundName}} 取消通知',
    '{{candidateName}} 原定于 {{interviewStartTime}} 的 {{roundName}} 已取消。原因：{{changeReason}}',
    '["candidateName","changeReason","interviewStartTime","roundName"]'::jsonb,
    now()
  );

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  ('system_ai_accepted_selected_hr_feishu', NULL, 'ai_invitation_accepted', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_ai_accepted_initiator_feishu', NULL, 'ai_invitation_accepted', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_ai_declined_selected_hr_feishu', NULL, 'ai_invitation_declined', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_ai_declined_initiator_feishu', NULL, 'ai_invitation_declined', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_ai_completed_selected_hr_feishu', NULL, 'ai_interview_completed', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_ai_completed_initiator_feishu', NULL, 'ai_interview_completed', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_accepted_selected_hr_feishu', NULL, 'human_invitation_accepted', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_accepted_initiator_feishu', NULL, 'human_invitation_accepted', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_declined_selected_hr_feishu', NULL, 'human_invitation_declined', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_declined_initiator_feishu', NULL, 'human_invitation_declined', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_interviewer_added_selected_hr_feishu', NULL, 'human_interviewer_added', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_interviewer_added_initiator_feishu', NULL, 'human_interviewer_added', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_human_completed_selected_hr_feishu', NULL, 'human_interview_completed', 'selected_hr_user', 'feishu', 'zh-CN'),
  ('system_human_completed_initiator_feishu', NULL, 'human_interview_completed', 'initiator_fallback', 'feishu', 'zh-CN');

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  ('system_ai_accepted_selected_hr_feishu_v1', 'system_ai_accepted_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 已接受 {{roundName}} AI 面试邀请。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_ai_accepted_initiator_feishu_v1', 'system_ai_accepted_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 已接受 {{roundName}} AI 面试邀请。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_ai_declined_selected_hr_feishu_v1', 'system_ai_declined_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 已拒绝 {{roundName}} AI 面试邀请，请及时跟进。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_ai_declined_initiator_feishu_v1', 'system_ai_declined_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 已拒绝 {{roundName}} AI 面试邀请，请及时跟进。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_ai_completed_selected_hr_feishu_v1', 'system_ai_completed_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 已完成 {{roundName}} AI 面试，报告生成后将另行通知。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_ai_completed_initiator_feishu_v1', 'system_ai_completed_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 已完成 {{roundName}} AI 面试，报告生成后将另行通知。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_accepted_selected_hr_feishu_v1', 'system_human_accepted_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 已确认参加 {{roundName}}，面试时间：{{interviewStartTime}}。', '["candidateName","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_accepted_initiator_feishu_v1', 'system_human_accepted_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 已确认参加 {{roundName}}，面试时间：{{interviewStartTime}}。', '["candidateName","interviewStartTime","roundName"]'::jsonb, now()),
  ('system_human_declined_selected_hr_feishu_v1', 'system_human_declined_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 已拒绝参加 {{roundName}}，请及时跟进。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_declined_initiator_feishu_v1', 'system_human_declined_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 已拒绝参加 {{roundName}}，请及时跟进。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_interviewer_added_selected_hr_feishu_v1', 'system_human_interviewer_added_selected_hr_feishu', 1, 'published', NULL, '{{interviewerNames}} 已接受 {{candidateName}} 的 {{roundName}} 面试官邀请。', '["candidateName","interviewerNames","roundName"]'::jsonb, now()),
  ('system_human_interviewer_added_initiator_feishu_v1', 'system_human_interviewer_added_initiator_feishu', 1, 'published', NULL, '{{interviewerNames}} 已接受 {{candidateName}} 的 {{roundName}} 面试官邀请。', '["candidateName","interviewerNames","roundName"]'::jsonb, now()),
  ('system_human_completed_selected_hr_feishu_v1', 'system_human_completed_selected_hr_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 真人面试已结束。', '["candidateName","roundName"]'::jsonb, now()),
  ('system_human_completed_initiator_feishu_v1', 'system_human_completed_initiator_feishu', 1, 'published', NULL, '{{candidateName}} 的 {{roundName}} 真人面试已结束。', '["candidateName","roundName"]'::jsonb, now());

UPDATE "interview_notification_template"
SET "active_version_id" = "interview_notification_template_version"."id"
FROM "interview_notification_template_version"
WHERE "interview_notification_template_version"."template_id" = "interview_notification_template"."id"
  AND "interview_notification_template_version"."version" = 1;

CREATE TABLE "interview_notification_event" (
  "actor_user_id" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "conversation_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "dedupe_key" text NOT NULL,
  "human_meeting_id" text,
  "human_round_id" text,
  "id" text PRIMARY KEY NOT NULL,
  "interview_record_id" text,
  "last_error_code" text,
  "last_error_message" text,
  "lease_expires_at" timestamp with time zone,
  "lease_owner" text,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "organization_id" text NOT NULL,
  "payload_snapshot" jsonb NOT NULL,
  "schedule_entry_id" text,
  "scope_type" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "type" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "interview_notification_event_actor_user_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "interview_notification_event_conversation_fk"
    FOREIGN KEY ("conversation_id") REFERENCES "interview_conversation" ("conversation_id") ON DELETE SET NULL,
  CONSTRAINT "interview_notification_event_human_meeting_fk"
    FOREIGN KEY ("human_meeting_id") REFERENCES "studio_human_interview_meeting" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_event_human_round_fk"
    FOREIGN KEY ("human_round_id") REFERENCES "studio_human_interview_round" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_event_interview_record_fk"
    FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_event_organization_fk"
    FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_event_schedule_entry_fk"
    FOREIGN KEY ("schedule_entry_id") REFERENCES "studio_interview_schedule" ("id") ON DELETE CASCADE,
  CONSTRAINT "interview_notification_event_status_check"
    CHECK ("status" IN ('pending', 'processing', 'completed', 'failed', 'dead', 'cancelled')),
  CONSTRAINT "interview_notification_event_scope_check"
    CHECK (
      ("scope_type" = 'interview_record' AND "interview_record_id" IS NOT NULL)
      OR ("scope_type" = 'ai_round' AND "schedule_entry_id" IS NOT NULL)
      OR ("scope_type" = 'human_meeting' AND "human_meeting_id" IS NOT NULL)
    ),
  CONSTRAINT "interview_notification_event_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "interview_notification_event_lease_pair_check"
    CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL))
);

CREATE UNIQUE INDEX "interview_notification_event_dedupe_uq"
  ON "interview_notification_event" ("dedupe_key");
CREATE INDEX "interview_notification_event_claim_idx"
  ON "interview_notification_event" ("status", "next_attempt_at", "available_at");
CREATE INDEX "interview_notification_event_org_created_idx"
  ON "interview_notification_event" ("organization_id", "created_at");
CREATE INDEX "interview_notification_event_record_created_idx"
  ON "interview_notification_event" ("interview_record_id", "created_at");
CREATE INDEX "interview_notification_event_meeting_created_idx"
  ON "interview_notification_event" ("human_meeting_id", "created_at");

ALTER TABLE "interview_notification"
  ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "audience_type" text,
  ADD COLUMN "channel" text,
  ADD COLUMN "event_id" text,
  ADD COLUMN "last_error_code" text,
  ADD COLUMN "lease_expires_at" timestamp with time zone,
  ADD COLUMN "lease_owner" text,
  ADD COLUMN "next_attempt_at" timestamp with time zone,
  ADD COLUMN "provider_message_id" text,
  ADD COLUMN "provider_request_key" text,
  ADD COLUMN "recipient_address" text,
  ADD COLUMN "recipient_display_name" text,
  ADD COLUMN "rendered_content" text,
  ADD COLUMN "rendered_subject" text,
  ADD COLUMN "result_unknown_at" timestamp with time zone,
  ADD COLUMN "template_version_id" text,
  ADD CONSTRAINT "interview_notification_event_fk"
    FOREIGN KEY ("event_id") REFERENCES "interview_notification_event" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "interview_notification_template_version_fk"
    FOREIGN KEY ("template_version_id")
    REFERENCES "interview_notification_template_version" ("id") ON DELETE SET NULL,
  ADD CONSTRAINT "interview_notification_delivery_status_check"
    CHECK ("status" IN ('pending', 'sending', 'sent', 'failed', 'dead', 'unknown', 'cancelled')),
  ADD CONSTRAINT "interview_notification_attempt_count_check"
    CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "interview_notification_lease_pair_check"
    CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL));

CREATE INDEX "interview_notification_event_idx"
  ON "interview_notification" ("event_id");
CREATE INDEX "interview_notification_delivery_claim_idx"
  ON "interview_notification" ("status", "next_attempt_at");
CREATE UNIQUE INDEX "interview_notification_event_channel_recipient_uq"
  ON "interview_notification" ("event_id", "channel", "recipient_address")
  WHERE "event_id" IS NOT NULL AND "channel" IS NOT NULL AND "recipient_address" IS NOT NULL;
CREATE UNIQUE INDEX "interview_notification_provider_request_uq"
  ON "interview_notification" ("provider_request_key")
  WHERE "provider_request_key" IS NOT NULL;
