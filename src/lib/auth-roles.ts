/**
 * 通过用户的飞书组织（tenant_key）做访问控制。
 * Access gating is driven by the user's Feishu organization (tenant_key).
 *
 * 仅当 `organizationId` 命中 `ADMIN_ORGANIZATION_ID` 列表时，才允许进入 Studio /
 * admin API 路由。`ADMIN_ORGANIZATION_ID` 为逗号分隔的允许列表，通过同名环境变量配置；
 * 详见 `.env.example`。
 *
 * Only users whose `organizationId` is included in `ADMIN_ORGANIZATION_ID` are
 * allowed into the Studio / admin API routes. The env var is a comma-separated list;
 * see `.env.example`.
 */

export const ADMIN_ORGANIZATION_IDS = (process.env.ADMIN_ORGANIZATION_ID ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

/**
 * 判断给定用户是否有 admin / studio 访问权限。
 * Whether the given user is allowed into admin / studio surfaces.
 */
export function canAccessAdmin(user: { organizationId?: string | null } | null | undefined) {
  if (ADMIN_ORGANIZATION_IDS.length === 0) {
    return false;
  }
  if (!user?.organizationId) {
    return false;
  }
  return ADMIN_ORGANIZATION_IDS.includes(user.organizationId);
}
