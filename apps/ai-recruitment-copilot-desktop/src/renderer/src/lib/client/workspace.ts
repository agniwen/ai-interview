import { authClient } from "@/lib/auth-client";

export interface WorkspaceOrg {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolve the active workspace slug for studio APIs.
 * Prefer lastActiveOrganizationId when present, otherwise first membership.
 */
export async function resolveActiveWorkspace(): Promise<WorkspaceOrg | null> {
  const [orgsResult, sessionResult] = await Promise.all([
    authClient.organization.list(),
    authClient.getSession(),
  ]);

  if (orgsResult.error) {
    throw new Error(orgsResult.error.message ?? "加载工作区失败");
  }

  const orgs = (orgsResult.data ?? [])
    .map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }))
    .filter((org): org is WorkspaceOrg => Boolean(org.slug));

  if (orgs.length === 0) {
    return null;
  }

  const lastId = (
    sessionResult.data?.user as { lastActiveOrganizationId?: string | null } | undefined
  )?.lastActiveOrganizationId;

  if (lastId) {
    const preferred = orgs.find((org) => org.id === lastId);
    if (preferred) {
      return preferred;
    }
  }

  return orgs[0] ?? null;
}
