import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";

/** Background permission snapshot refresh interval (TanStack Query refetchInterval). */
export const WORKSPACE_PERMISSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const workspaceAccessKeys = {
  all: ["workspace-access"] as const,
  bySlug: (slug: string) => ["workspace-access", slug] as const,
};

export interface WorkspaceAccessSnapshot {
  id: string;
  memberRole: string;
  permissions: WorkspacePermissionStatements;
  slug: string;
}

function assignLocation(href: string) {
  if (!globalThis.window) {
    return;
  }
  globalThis.window.location.assign(href);
}

/**
 * Fetch the current user's workspace access + permission snapshot.
 * Non-ready statuses navigate away and throw so Query keeps the last good data.
 */
export async function fetchWorkspaceAccessSnapshot(slug: string): Promise<WorkspaceAccessSnapshot> {
  const state = await getWorkspaceAccessState({ data: { slug } });

  if (state.status === "unauthenticated") {
    const callbackURL = globalThis.window
      ? `${globalThis.window.location.pathname}${globalThis.window.location.search}`
      : `/w/${slug}`;
    assignLocation(`/login?callbackURL=${encodeURIComponent(callbackURL)}`);
    throw new Error("Workspace access unauthenticated");
  }

  if (state.status === "not_found") {
    assignLocation("/");
    throw new Error("Workspace access not found");
  }

  if (state.member.role === NO_ACCESS_WORKSPACE_ROLE) {
    assignLocation("/wait");
    throw new Error("Workspace access denied");
  }

  return {
    id: state.workspace.id,
    memberRole: state.member.role,
    permissions: state.permissions,
    slug: state.workspace.slug,
  };
}

export function workspaceAccessSnapshotFromLoader(input: {
  id: string;
  memberRole: string;
  permissions: WorkspacePermissionStatements;
  slug: string;
}): WorkspaceAccessSnapshot {
  return {
    id: input.id,
    memberRole: input.memberRole,
    permissions: input.permissions,
    slug: input.slug,
  };
}
