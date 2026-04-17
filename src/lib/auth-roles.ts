/**
 * Access gating is driven by the user's Feishu organization (tenant_key).
 * Only users whose `organizationId` matches `ADMIN_ORGANIZATION_ID` are
 * allowed into the Studio / admin API routes.
 *
 * Configure via the `ADMIN_ORGANIZATION_ID` env var — see `.env.example`.
 */

export const ADMIN_ORGANIZATION_ID = process.env.ADMIN_ORGANIZATION_ID ?? "";

export function canAccessAdmin(user: { organizationId?: string | null } | null | undefined) {
  if (!ADMIN_ORGANIZATION_ID) {
    return false;
  }
  return user?.organizationId === ADMIN_ORGANIZATION_ID;
}
