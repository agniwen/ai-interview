-- 回填 session.active_organization_id。
-- P0 加这列时是 nullable，没有 backfill；旧 session 的此列是 NULL。
-- auth.api.hasPermission 依赖该列解析当前用户在活跃 org 的角色,NULL 会导致权限校验直接失败。
-- 把每条 session 设到该用户最早加入的 member.organization_id。

UPDATE "session" s
SET "active_organization_id" = (
  SELECT m."organization_id"
  FROM "member" m
  WHERE m."user_id" = s."user_id"
  ORDER BY m."created_at" ASC
  LIMIT 1
)
WHERE s."active_organization_id" IS NULL;
