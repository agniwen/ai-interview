-- Phase 1：先以 nullable 加列，因为已有派生行；后面会用归一化结果重填后再补 NOT NULL。
-- Phase 1: add the column as nullable; we'll repopulate from JSONB with the
-- normalized form and set NOT NULL once the data is in place.
ALTER TABLE "studio_interview_skill" ADD COLUMN "display_skill" text;
--> statement-breakpoint
-- 派生数据可随时从 JSONB 真相重建，全量清掉后按归一化规则重填。
-- Wipe the derived rows; we'll re-fill from the JSONB source applying the
-- new normalization rules.
DELETE FROM "studio_interview_skill";
--> statement-breakpoint
-- 反填：lowercase + trim + 连续空白折叠为单空格作为归一化 skill；
-- 同一候选人若有 "React"/"react" 两个写法，只留首个 display 值（DISTINCT ON）。
-- Backfill: normalized skill = lowercase + trim + collapse whitespace. When
-- a candidate's JSONB contains case-only duplicates, the DISTINCT ON keeps
-- one display string per (interview, normalized) pair.
INSERT INTO "studio_interview_skill" ("interview_id", "organization_id", "skill", "display_skill")
SELECT DISTINCT ON (interview_id, skill)
  interview_id, organization_id, skill, display_skill
FROM (
  SELECT
    si.id AS interview_id,
    si.organization_id,
    lower(regexp_replace(btrim(s.value), '\s+', ' ', 'g')) AS skill,
    regexp_replace(btrim(s.value), '\s+', ' ', 'g') AS display_skill
  FROM "studio_interview" si,
       LATERAL jsonb_array_elements_text(si.resume_profile -> 'skills') AS s(value)
  WHERE si.resume_profile IS NOT NULL
    AND jsonb_typeof(si.resume_profile -> 'skills') = 'array'
    AND btrim(s.value) <> ''
) candidates;
--> statement-breakpoint
ALTER TABLE "studio_interview_skill" ALTER COLUMN "display_skill" SET NOT NULL;
