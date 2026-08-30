-- =====================================================================
-- 候选人状态机改造：拆分原 record-level status 为 pipeline_stage + outcome 两维
--   1. 新增 pipeline_stage / outcome（带默认值），保证旧 INSERT 路径仍可写入
--   2. 新增 8 个阶段元数据字段（笔试/真人复面/offer/关闭原因）
--   3. 新增 3 个索引（pipeline_stage、outcome、复合）
--   4. 数据回填：从 legacy status 派生 pipeline_stage 与 outcome
--   5. CHECK 约束：outcome != 'in_pipeline' ⇔ pipeline_stage = 'closed'
--
-- 旧 status 列、status idx 暂不删除，dev/prod 共享 DB 期间继续被 app dual-write，
-- 等所有消费方切到新字段后再 DROP（单独 migration）。
--
-- Candidate state-machine redesign: split the legacy record-level status
-- into two orthogonal axes (pipeline_stage + outcome).
--   1. Add pipeline_stage / outcome with defaults so legacy INSERT paths still work.
--   2. Add eight stage-metadata columns (written test / human interview / offer / close).
--   3. Add three new indexes.
--   4. Backfill new columns from the legacy status enum.
--   5. CHECK constraint enforcing the outcome ↔ stage invariant.
-- Legacy `status` column and its index are intentionally kept — app code still
-- dual-writes them during the consumer migration window; will drop in a later PR.
-- =====================================================================

ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "pipeline_stage" text DEFAULT 'screening' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "outcome" text DEFAULT 'in_pipeline' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "written_test_scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "written_test_score" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "human_interview_scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "human_interviewer_id" text;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "offer_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "offer_accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "studio_interview" ADD COLUMN IF NOT EXISTS "closed_reason" text;--> statement-breakpoint

-- 从 legacy status 回填新两维。仅当 outcome 仍是默认 'in_pipeline'
-- 且 pipeline_stage 仍是默认 'screening' 时写入，避免对已经手动操作过的行重复覆盖
-- （再次执行此 migration 时是安全 no-op）。
-- Backfill the two new axes from the legacy status enum. Restricted to rows
-- where both axes are still default so re-runs don't clobber later edits.
UPDATE "studio_interview" SET
	pipeline_stage = CASE status
		WHEN 'draft'       THEN 'screening'
		WHEN 'ready'       THEN 'ai_interview'
		WHEN 'in_progress' THEN 'ai_interview'
		WHEN 'completed'   THEN 'ai_interview'
		WHEN 'archived'    THEN 'closed'
		ELSE pipeline_stage
	END,
	outcome = CASE status
		WHEN 'archived' THEN 'archived'
		ELSE 'in_pipeline'
	END,
	closed_at = CASE WHEN status = 'archived' THEN updated_at ELSE closed_at END
WHERE outcome = 'in_pipeline' AND pipeline_stage = 'screening';
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_human_interviewer_id_user_id_fkey" FOREIGN KEY ("human_interviewer_id") REFERENCES "user"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- outcome / pipeline_stage 一致性约束。
-- Invariant: outcome != 'in_pipeline' iff pipeline_stage = 'closed'.
DO $$ BEGIN
	ALTER TABLE "studio_interview" ADD CONSTRAINT "studio_interview_outcome_stage_consistency" CHECK (
		(outcome = 'in_pipeline' AND pipeline_stage != 'closed') OR
		(outcome != 'in_pipeline' AND pipeline_stage = 'closed')
	);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "studio_interview_pipeline_stage_idx" ON "studio_interview" ("pipeline_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_interview_outcome_idx" ON "studio_interview" ("outcome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studio_interview_stage_outcome_idx" ON "studio_interview" ("pipeline_stage","outcome");
