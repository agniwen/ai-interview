-- 面试管理与审批流配置拆出独立的页面权限；已有自定义角色保留原来能看到的页面。
-- Calendar and offer-approval templates now have their own page permissions; keep existing
-- dynamic roles able to open the pages they could open before the split.
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') || '["calendar"]'::jsonb
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ? 'interviews'
  AND NOT (("permission"::jsonb -> 'page') ? 'calendar');
--> statement-breakpoint
UPDATE "organization_role"
SET "permission" = jsonb_set(
  "permission"::jsonb,
  '{page}',
  ("permission"::jsonb -> 'page') || '["offerApprovalTemplates"]'::jsonb
)::text
WHERE jsonb_typeof("permission"::jsonb -> 'page') = 'array'
  AND ("permission"::jsonb -> 'page') ? 'offerApprovals'
  AND jsonb_typeof("permission"::jsonb -> 'offerApproval') = 'array'
  AND ("permission"::jsonb -> 'offerApproval') ? 'manage'
  AND NOT (("permission"::jsonb -> 'page') ? 'offerApprovalTemplates');
