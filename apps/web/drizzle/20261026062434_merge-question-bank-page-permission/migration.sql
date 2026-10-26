-- 表单题与沟通题并入「面试题配置」页面：能打开任一旧页面的自定义角色获得新页面权限，并移除两个已退役的页面权限。
-- Forms and interview questions merge into the question bank page: custom roles that could open
-- either old page gain the new page permission, and both retired page permissions are removed.
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') || '["questionBank"]'::jsonb
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ?| ARRAY['forms', 'interviewQuestions']
  AND NOT (("permission"::jsonb -> 'page') ? 'questionBank');
--> statement-breakpoint
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') - ARRAY['forms', 'interviewQuestions']
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ?| ARRAY['forms', 'interviewQuestions'];
