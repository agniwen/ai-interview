import { authClient } from "@/lib/auth-client";
import { z } from "zod";

export interface WorkspaceOrg {
  id: string;
  name: string;
  slug: string;
}

export const desktopWorkspaceKeys = {
  active: ["desktop-active-workspace"] as const,
  list: ["desktop-organizations"] as const,
};

const sessionUserSchema = z.object({
  lastActiveOrganizationId: z.string().nullable().optional(),
});

function toWorkspaceOrg(org: {
  id: string;
  name: string;
  slug?: string | null;
}): WorkspaceOrg | null {
  if (!org.slug) {
    return null;
  }
  return { id: org.id, name: org.name, slug: org.slug };
}

/**
 * List workspaces the current user belongs to (slug required for studio APIs).
 */
export async function listWorkspaces(): Promise<WorkspaceOrg[]> {
  const orgsResult = await authClient.organization.list();
  if (orgsResult.error) {
    throw new Error(orgsResult.error.message ?? "加载工作区失败");
  }

  return (orgsResult.data ?? [])
    .map((org) => toWorkspaceOrg(org))
    .filter((org): org is WorkspaceOrg => org !== null);
}

/**
 * Resolve the active workspace for studio APIs.
 * Prefer session.activeOrganizationId (set via switcher), then
 * user.lastActiveOrganizationId, otherwise the first membership.
 */
export async function resolveActiveWorkspace(): Promise<WorkspaceOrg | null> {
  const [orgs, sessionResult] = await Promise.all([listWorkspaces(), authClient.getSession()]);

  if (orgs.length === 0) {
    return null;
  }

  const sessionActiveId = sessionResult.data?.session?.activeOrganizationId;
  if (sessionActiveId) {
    const fromSession = orgs.find((org) => org.id === sessionActiveId);
    if (fromSession) {
      return fromSession;
    }
  }

  const sessionUser = sessionUserSchema.safeParse(sessionResult.data?.user);
  const lastId = sessionUser.success ? sessionUser.data.lastActiveOrganizationId : null;

  if (lastId) {
    const preferred = orgs.find((org) => org.id === lastId);
    if (preferred) {
      return preferred;
    }
  }

  return orgs[0] ?? null;
}

/**
 * Switch the active workspace for this session (Better Auth set-active).
 * Studio fetches use the selected slug from the active-workspace query cache.
 */
export async function setActiveWorkspace(organizationId: string): Promise<WorkspaceOrg> {
  const result = await authClient.organization.setActive({ organizationId });
  if (result.error) {
    throw new Error(result.error.message ?? "切换工作区失败");
  }

  const org = result.data ? toWorkspaceOrg(result.data) : null;
  if (org) {
    return org;
  }

  // Fallback if setActive response omits slug/name — re-resolve from membership list.
  const orgs = await listWorkspaces();
  const matched = orgs.find((item) => item.id === organizationId);
  if (!matched) {
    throw new Error("切换工作区失败");
  }
  return matched;
}
