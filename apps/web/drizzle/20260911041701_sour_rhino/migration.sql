ALTER TABLE "recruiting_offer" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "email_recipient" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "response_by" text;--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD COLUMN "response_source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_offer_public_token_uniq" ON "recruiting_offer" ("public_token");--> statement-breakpoint
ALTER TABLE "recruiting_offer" ADD CONSTRAINT "recruiting_offer_response_source_check" CHECK ("response_source" IS NULL OR "response_source" IN ('candidate','hr'));

INSERT INTO "interview_notification_template"
  ("id", "organization_id", "event_type", "audience_type", "channel", "locale")
VALUES
  ('system_offer_accepted_initiator_feishu', NULL, 'offer_accepted', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_offer_accepted_initiator_email', NULL, 'offer_accepted', 'initiator_fallback', 'email', 'zh-CN'),
  ('system_offer_declined_initiator_feishu', NULL, 'offer_declined', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_offer_declined_initiator_email', NULL, 'offer_declined', 'initiator_fallback', 'email', 'zh-CN');--> statement-breakpoint

INSERT INTO "interview_notification_template_version"
  ("id", "template_id", "version", "status", "subject_template", "content_template", "variables", "published_at")
VALUES
  ('system_offer_accepted_initiator_feishu_v1', 'system_offer_accepted_initiator_feishu', 1, 'published', NULL, E'候选人 {{candidateName}} 已接受 {{jobName}} 的 Offer。\n反馈时间：{{responseTime}}\n[查看候选人]({{interviewLink}})', '["candidateName","interviewLink","jobName","responseTime"]'::jsonb, now()),
  ('system_offer_accepted_initiator_email_v1', 'system_offer_accepted_initiator_email', 1, 'published', '{{candidateName}} 已接受 Offer', E'候选人 {{candidateName}} 已接受 {{jobName}} 的 Offer。\n反馈时间：{{responseTime}}\n查看候选人：{{interviewLink}}', '["candidateName","interviewLink","jobName","responseTime"]'::jsonb, now()),
  ('system_offer_declined_initiator_feishu_v1', 'system_offer_declined_initiator_feishu', 1, 'published', NULL, E'候选人 {{candidateName}} 已拒绝 {{jobName}} 的 Offer。\n反馈时间：{{responseTime}}\n拒绝原因：{{changeReason}}\n请决定继续沟通或结束招聘流程。\n[查看候选人]({{interviewLink}})', '["candidateName","changeReason","interviewLink","jobName","responseTime"]'::jsonb, now()),
  ('system_offer_declined_initiator_email_v1', 'system_offer_declined_initiator_email', 1, 'published', '{{candidateName}} 已拒绝 Offer', E'候选人 {{candidateName}} 已拒绝 {{jobName}} 的 Offer。\n反馈时间：{{responseTime}}\n拒绝原因：{{changeReason}}\n请决定继续沟通或结束招聘流程。\n查看候选人：{{interviewLink}}', '["candidateName","changeReason","interviewLink","jobName","responseTime"]'::jsonb, now());--> statement-breakpoint

UPDATE "interview_notification_template"
SET "active_version_id" = "id" || '_v1', "updated_at" = now()
WHERE "id" IN (
  'system_offer_accepted_initiator_feishu',
  'system_offer_accepted_initiator_email',
  'system_offer_declined_initiator_feishu',
  'system_offer_declined_initiator_email'
);
