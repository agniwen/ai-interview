ALTER TABLE "candidate_form_submission" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "feishu_thread_state" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "global_config" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "interviewer" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "job_description" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feishu_tenant_key" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feishu_tenant_name" text;--> statement-breakpoint
CREATE INDEX "candidate_form_submission_organization_idx" ON "candidate_form_submission" ("organization_id");--> statement-breakpoint
CREATE INDEX "candidate_form_template_organization_idx" ON "candidate_form_template" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_attachment_organization_idx" ON "chat_attachment" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_organization_idx" ON "chat_conversation" ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_message_organization_idx" ON "chat_message" ("organization_id");--> statement-breakpoint
CREATE INDEX "department_organization_idx" ON "department" ("organization_id");--> statement-breakpoint
CREATE INDEX "feishu_thread_state_organization_idx" ON "feishu_thread_state" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_audit_log_organization_idx" ON "interview_audit_log" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_organization_idx" ON "interview_conversation" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_conversation_turn_organization_idx" ON "interview_conversation_turn" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_notification_organization_idx" ON "interview_notification" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_organization_idx" ON "interview_question_template" ("organization_id");--> statement-breakpoint
CREATE INDEX "interview_question_template_binding_organization_idx" ON "interview_question_template_binding" ("organization_id");--> statement-breakpoint
CREATE INDEX "interviewer_organization_idx" ON "interviewer" ("organization_id");--> statement-breakpoint
CREATE INDEX "job_description_organization_idx" ON "job_description" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_interview_organization_idx" ON "studio_interview" ("organization_id");--> statement-breakpoint
CREATE INDEX "studio_interview_schedule_organization_idx" ON "studio_interview_schedule" ("organization_id");--> statement-breakpoint
ALTER TABLE "candidate_form_submission" ADD CONSTRAINT "candidate_form_submission_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "candidate_form_template" ADD CONSTRAINT "candidate_form_template_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_attachment" ADD CONSTRAINT "chat_attachment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_conversation" ADD CONSTRAINT "chat_conversation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feishu_thread_state" ADD CONSTRAINT "feishu_thread_state_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "global_config" ADD CONSTRAINT "global_config_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_audit_log" ADD CONSTRAINT "interview_audit_log_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation" ADD CONSTRAINT "interview_conversation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_conversation_turn" ADD CONSTRAINT "interview_conversation_turn_oIAEcdNaEzPz_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_notification" ADD CONSTRAINT "interview_notification_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template" ADD CONSTRAINT "interview_question_template_J7zIM98fJ9xH_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interview_question_template_binding" ADD CONSTRAINT "interview_question_template_binding_B19cq7nDyZhl_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interviewer" ADD CONSTRAINT "interviewer_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "job_description" ADD CONSTRAINT "job_description_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "studio_interview_schedule" ADD CONSTRAINT "studio_interview_schedule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;

-- ============================================================
-- DATA BACKFILL (multi-tenant P1) — runs as part of migration
-- ============================================================

-- 7.1 创建默认 workspace
INSERT INTO "organization" ("id", "name", "slug", "created_at")
VALUES ('org_default', '默认工作区', 'default', NOW())
ON CONFLICT ("id") DO NOTHING;

-- 7.2 把所有现有用户加为成员
--   • 老 ADMIN_ORGANIZATION_ID 列表里的 feishu tenant_key  → admin
--   • better-auth user.role='admin'                           → admin
--   • 其他人                                                  → hr (不中断业务)
-- ADMIN_ORG_IDS 在生产部署时由 op 用 psql 替换为真实 tenant_key 数组,
-- 例如: '("acme_tenant","beta_tenant")'. dev / staging 留空即可 (改成 NULL 列表).
INSERT INTO "member" ("id", "user_id", "organization_id", "role", "created_at")
SELECT
  'mem_' || u.id,
  u.id,
  'org_default',
  CASE
    -- 注: ADMIN_ORG_IDS 占位符需要在执行前替换为实际 tenant_keys; 见上方注释
    -- WHEN u.organization_id IN ('tenant_key_1', 'tenant_key_2') THEN 'admin'
    WHEN u.role = 'admin' THEN 'admin'
    ELSE 'hr'
  END,
  NOW()
FROM "user" u
ON CONFLICT ("user_id", "organization_id") DO NOTHING;

-- 7.3 把第一个 admin 提升为 owner
UPDATE "member"
SET "role" = 'owner'
WHERE "id" = (
  SELECT "id" FROM "member"
  WHERE "organization_id" = 'org_default' AND "role" = 'admin'
  ORDER BY "created_at" ASC
  LIMIT 1
);

-- 7.4 业务表 backfill organizationId
UPDATE "studio_interview"                       SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "department"                             SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interviewer"                            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "job_description"                        SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "candidate_form_template"                SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_question_template"            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_conversation"                      SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_attachment"                        SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "feishu_thread_state"                    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_conversation"                 SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_conversation_turn"            SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_audit_log"                    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_notification"                 SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "studio_interview_schedule"              SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "candidate_form_submission"              SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "interview_question_template_binding"    SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;
UPDATE "chat_message"                           SET "organization_id" = 'org_default' WHERE "organization_id" IS NULL;

-- 7.5 global_config 也 backfill (保留 singleton 行,仅打 org 标识)
UPDATE "global_config"
SET "organization_id" = 'org_default'
WHERE "id" = 'singleton' AND "organization_id" IS NULL;

-- 7.6 user 表 feishuTenantKey / feishuTenantName backfill (从旧列复制)
UPDATE "user"
SET "feishu_tenant_key"  = "organization_id",
    "feishu_tenant_name" = "organization_name"
WHERE "feishu_tenant_key" IS NULL AND "organization_id" IS NOT NULL;