-- =====================================================================
-- 真人复面 + Offer 子表迁移（pipelineStage = human_interview / offer 阶段的数据落点）
--   1. studio_human_interview_round：单轮复面记录（多轮、多面试官走 junction）
--   2. studio_human_interview_round_interviewer：面试官 junction，(roundId, userId) 复合 PK
--   3. studio_offer_draft：Offer 多版本草稿
--   4. studio_interview 加 candidate_expectations_meta / closed_meta JSONB 列
--
-- 全部语句加 IF NOT EXISTS / DO $$ EXCEPTION 守卫，dev/prod 共享 DB 下重复跑也安全。
--
-- Human-interview + Offer subtables migration. All statements are idempotent
-- via IF NOT EXISTS guards (DDL) and DO blocks (constraint additions) so
-- re-running on dev/prod shared DBs is safe.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "studio_human_interview_round" (
	"cancel_reason" text,
	"cancelled_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"feedback" text,
	"format" text NOT NULL,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"label" text NOT NULL,
	"location" text,
	"meeting_url" text,
	"notes" text,
	"organization_id" text NOT NULL,
	"outcome" text,
	"scheduled_at" timestamp,
	"score" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_human_interview_round_interviewer" (
	"round_id" text,
	"user_id" text,
	CONSTRAINT "studio_human_interview_round_interviewer_pkey" PRIMARY KEY("round_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_offer_draft" (
	"base_salary" integer NOT NULL,
	"bonus" integer,
	"candidate_counter" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"equity" text,
	"expires_at" timestamp,
	"id" text PRIMARY KEY,
	"interview_record_id" text NOT NULL,
	"joining_date" timestamp,
	"notes" text,
	"organization_id" text NOT NULL,
	"position" text NOT NULL,
	"response_at" timestamp,
	"sent_at" timestamp,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "candidate_expectations_meta" jsonb;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "closed_meta" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_human_interview_round_record_idx" ON "studio_human_interview_round" ("interview_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_human_interview_round_sort_idx" ON "studio_human_interview_round" ("interview_record_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_human_interview_round_org_idx" ON "studio_human_interview_round" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_human_interview_round_status_idx" ON "studio_human_interview_round" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_human_interview_round_interviewer_user_idx" ON "studio_human_interview_round_interviewer" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "studio_offer_draft_record_version_uniq" ON "studio_offer_draft" ("interview_record_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_offer_draft_record_idx" ON "studio_offer_draft" ("interview_record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_offer_draft_org_idx" ON "studio_offer_draft" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_offer_draft_status_idx" ON "studio_offer_draft" ("status");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_human_interview_round" ADD CONSTRAINT "studio_human_interview_round_YSO6QLSA2eCu_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_human_interview_round" ADD CONSTRAINT "studio_human_interview_round_8u71FlBrk4vP_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_human_interview_round_interviewer" ADD CONSTRAINT "studio_human_interview_round_interviewer_k8kOc155j3x3_fkey" FOREIGN KEY ("round_id") REFERENCES "studio_human_interview_round"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_human_interview_round_interviewer" ADD CONSTRAINT "studio_human_interview_round_interviewer_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_offer_draft" ADD CONSTRAINT "studio_offer_draft_interview_record_id_studio_interview_id_fkey" FOREIGN KEY ("interview_record_id") REFERENCES "studio_interview"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "studio_offer_draft" ADD CONSTRAINT "studio_offer_draft_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
