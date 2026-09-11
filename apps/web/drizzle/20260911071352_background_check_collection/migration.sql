CREATE TABLE "recruiting_background_check" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"email_recipient" text,
	"email_sent_at" timestamp with time zone,
	"form_data" jsonb,
	"organization_id" text NOT NULL,
	"public_token" text NOT NULL,
	"recruiting_record_id" text PRIMARY KEY,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recruiting_background_check_status_check" CHECK ("status" IN ('pending','sent','submitted')),
	CONSTRAINT "recruiting_background_check_submission_check" CHECK (("status" = 'submitted' AND "form_data" IS NOT NULL AND "submitted_at" IS NOT NULL) OR ("status" <> 'submitted' AND "form_data" IS NULL AND "submitted_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recruiting_background_check_public_token_uq" ON "recruiting_background_check" ("public_token");--> statement-breakpoint
CREATE INDEX "recruiting_background_check_org_status_idx" ON "recruiting_background_check" ("organization_id","status");--> statement-breakpoint
ALTER TABLE "recruiting_background_check" ADD CONSTRAINT "recruiting_background_check_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "recruiting_background_check" ADD CONSTRAINT "recruiting_background_check_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recruiting_background_check" ADD CONSTRAINT "recruiting_background_check_record_org_fk" FOREIGN KEY ("recruiting_record_id","organization_id") REFERENCES "recruiting_record"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
INSERT INTO "interview_notification_template" (
  "id", "organization_id", "event_type", "audience_type", "channel", "locale"
) VALUES
  ('system_background_check_submitted_initiator_feishu', NULL, 'background_check_submitted', 'initiator_fallback', 'feishu', 'zh-CN'),
  ('system_background_check_submitted_initiator_email', NULL, 'background_check_submitted', 'initiator_fallback', 'email', 'zh-CN')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "interview_notification_template_version" (
  "id", "template_id", "version", "status", "subject_template", "content_template", "variables", "created_at"
) VALUES
  ('system_background_check_submitted_initiator_feishu_v1', 'system_background_check_submitted_initiator_feishu', 1, 'published', NULL, E'候选人 {{candidateName}} 已提交 {{jobName}} 的背景调查信息。\n提交时间：{{responseTime}}\n请核对信息并记录背调结果。\n[查看并确认背调结果]({{interviewLink}})', '["candidateName","interviewLink","jobName","responseTime"]'::jsonb, now()),
  ('system_background_check_submitted_initiator_email_v1', 'system_background_check_submitted_initiator_email', 1, 'published', '{{candidateName}} 已提交背景调查信息', E'候选人 {{candidateName}} 已提交 {{jobName}} 的背景调查信息。\n提交时间：{{responseTime}}\n请核对信息并记录背调结果。\n查看候选人：{{interviewLink}}', '["candidateName","interviewLink","jobName","responseTime"]'::jsonb, now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "interview_notification_template"
SET "active_version_id" = "id" || '_v1', "updated_at" = now()
WHERE "id" IN (
  'system_background_check_submitted_initiator_feishu',
  'system_background_check_submitted_initiator_email'
);
