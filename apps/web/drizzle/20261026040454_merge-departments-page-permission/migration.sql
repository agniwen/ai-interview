-- 部门管理并入岗位设置页的部门栏：能打开部门管理的自定义角色改为可打开岗位设置，并移除已退役的页面权限。
-- Department management now lives in the job settings rail: custom roles that could open the
-- departments page gain the job settings page, and the retired page permission is removed.
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') || '["jobDescriptions"]'::jsonb
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ? 'departments'
  AND NOT (("permission"::jsonb -> 'page') ? 'jobDescriptions');
--> statement-breakpoint
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') - 'departments'
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ? 'departments';
