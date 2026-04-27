/**
 * Access gating is driven by the user's Feishu organization (tenant_key).
 * Only users whose `organizationId` is included in `ADMIN_ORGANIZATION_ID`
 * are allowed into the Studio / admin API routes.
 *
 * `ADMIN_ORGANIZATION_ID` is a comma-separated list of allowed organization
 * IDs. Configure via the `ADMIN_ORGANIZATION_ID` env var — see `.env.example`.
 */

export const ADMIN_ORGANIZATION_IDS = (process.env.ADMIN_ORGANIZATION_ID ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => id.length > 0);

export function canAccessAdmin(user: { organizationId?: string | null } | null | undefined) {
  if (ADMIN_ORGANIZATION_IDS.length === 0) {
    return false;
  }
  if (!user?.organizationId) {
    return false;
  }
  return ADMIN_ORGANIZATION_IDS.includes(user.organizationId);
}
