-- =====================================================================
-- 「完美形态」技能筛选迁移：
--   1. studio_interview 增加 skills_normalized text[] 列 + GIN 索引
--   2. 新增 per-org canonical 表 studio_org_skill（normalized PK / display /
--      candidate_count / alias_of 预留 Phase 2）
--   3. 触发器：studio_interview DELETE 时自动 DECR canonical 表计数
--   4. 从 resume_profile JSONB 反填两边
--   5. DROP 旧派生表 studio_interview_skill
--
-- "Perfect form" skill filter migration:
--   1. Add text[] skills_normalized + GIN index on studio_interview
--   2. New per-org canonical table studio_org_skill (PK on (org, normalized);
--      display / candidate_count / alias_of for Phase 2 synonyms)
--   3. Trigger: DECR canonical counts on studio_interview DELETE
--   4. Backfill both from resume_profile JSONB
--   5. DROP legacy join table studio_interview_skill
-- =====================================================================

-- Step 1: 候选人行上的归一化数组列
-- Step 1: normalized array column on the candidate row
ALTER TABLE "studio_interview"
  ADD COLUMN "skills_normalized" text[] NOT NULL DEFAULT '{}'::text[];
--> statement-breakpoint

-- 从 JSONB 反填：lowercase + trim + 折叠空白；DISTINCT 去重
-- Backfill from JSONB: lowercase + trim + collapse whitespace; DISTINCT to dedupe
UPDATE "studio_interview" si
SET "skills_normalized" = COALESCE((
  SELECT array_agg(DISTINCT lower(regexp_replace(btrim(s.value), '\s+', ' ', 'g')))
  FROM jsonb_array_elements_text(si.resume_profile -> 'skills') AS s(value)
  WHERE btrim(s.value) <> ''
), '{}'::text[])
WHERE si.resume_profile IS NOT NULL
  AND jsonb_typeof(si.resume_profile -> 'skills') = 'array';
--> statement-breakpoint

-- GIN 索引支撑 `@>` 包含匹配（任选 N 个技能时都走索引）
-- GIN index drives `@>` contains-all matching; one index covers any N-of-K query
CREATE INDEX "studio_interview_skills_normalized_idx"
  ON "studio_interview" USING GIN ("skills_normalized");
--> statement-breakpoint

-- Step 2: 每组织一份的 canonical 表
-- Step 2: per-org canonical table
CREATE TABLE "studio_org_skill" (
  "alias_of" text,
  "candidate_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "display" text NOT NULL,
  "normalized" text NOT NULL,
  "organization_id" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "studio_org_skill_pkey" PRIMARY KEY ("organization_id", "normalized")
);
--> statement-breakpoint
ALTER TABLE "studio_org_skill"
  ADD CONSTRAINT "studio_org_skill_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "studio_org_skill_count_idx"
  ON "studio_org_skill" ("organization_id", "candidate_count");
--> statement-breakpoint

-- 反填 canonical：用 mode() within group 选最常见的 display 写法；
-- candidate_count 是该 (org, normalized) 下 distinct interview 数。
-- Backfill canonical: pick the most-common display via mode() within group;
-- candidate_count is the number of distinct candidates with that normalized skill.
INSERT INTO "studio_org_skill"
  ("organization_id", "normalized", "display", "candidate_count")
SELECT
  organization_id,
  normalized,
  mode() WITHIN GROUP (ORDER BY display) AS display,
  COUNT(*)::int AS candidate_count
FROM (
  SELECT DISTINCT ON (si.id, normalized)
    si.id AS interview_id,
    si.organization_id,
    lower(regexp_replace(btrim(s.value), '\s+', ' ', 'g')) AS normalized,
    regexp_replace(btrim(s.value), '\s+', ' ', 'g') AS display
  FROM "studio_interview" si,
       LATERAL jsonb_array_elements_text(si.resume_profile -> 'skills') AS s(value)
  WHERE si.resume_profile IS NOT NULL
    AND jsonb_typeof(si.resume_profile -> 'skills') = 'array'
    AND btrim(s.value) <> ''
) per_candidate
GROUP BY organization_id, normalized;
--> statement-breakpoint

-- Step 3: 触发器：candidate 被删（含 ON DELETE CASCADE）时自动 DECR 计数。
-- 这是为了让 hard-delete 路径（admin / cascade / 手动 SQL）也保持 canonical 计数同步，
-- 不依赖应用层兜底。`GREATEST(... , 0)` 是防御性下界，避免极端情况下计数变负。
--
-- Step 3: trigger to decrement canonical counts when candidates are deleted
-- (handles app-level deletes, ON DELETE CASCADE, and ad-hoc SQL alike). The
-- GREATEST(..., 0) clamps defensively in case of double-decrement.
CREATE OR REPLACE FUNCTION decrement_studio_org_skill_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.skills_normalized IS NULL OR cardinality(OLD.skills_normalized) = 0 THEN
    RETURN OLD;
  END IF;
  UPDATE "studio_org_skill"
  SET "candidate_count" = GREATEST("candidate_count" - 1, 0),
      "updated_at" = now()
  WHERE "organization_id" = OLD.organization_id
    AND "normalized" = ANY(OLD.skills_normalized);
  RETURN OLD;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER "studio_interview_skill_count_decrement"
BEFORE DELETE ON "studio_interview"
FOR EACH ROW EXECUTE FUNCTION decrement_studio_org_skill_counts();
--> statement-breakpoint

-- Step 4: 拆掉旧派生表（功能已被 skills_normalized + studio_org_skill 完整替代）
-- Step 4: drop the legacy join table — its responsibility is now split between
-- skills_normalized (filter) and studio_org_skill (display + counter).
DROP TABLE "studio_interview_skill";
