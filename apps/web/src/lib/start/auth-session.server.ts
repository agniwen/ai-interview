import type {
  ActiveOrganizationState,
  NoAccessWaitState,
  StudioPagePermissionAction,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";
import { hasPermissionInStatements } from "@app/shared/permission-statements";

export async function getActiveOrganizationStateFromRequest(): Promise<ActiveOrganizationState> {
  return await rpcFetch(
    getServerRpc().api.session["active-workspace"].$get(),
    "加载当前工作区失败",
  );
}

export async function getWorkspaceSelectionStateFromRequest(): Promise<WorkspaceSelectionState> {
  return await rpcFetch(getServerRpc().api.session.workspaces.$get(), "加载工作区列表失败");
}

export async function getNoAccessWaitStateFromRequest(): Promise<NoAccessWaitState> {
  return await rpcFetch(
    getServerRpc().api.session["no-access-wait"].$get(),
    "加载工作区访问状态失败",
  );
}

export async function resolveWorkspaceAccessFromRequest(
  slug: string,
): Promise<WorkspaceAccessState> {
  return await rpcFetch(
    getServerRpc().api.session.workspaces[":slug"].access.$get({ param: { slug } }),
    "加载工作区权限失败",
  );
}

/**
 * Resolve the first Studio page this member may open, using a single access snapshot.
 */
export async function resolveFirstAllowedStudioPagePath(
  slug: string,
  pagePaths: readonly { action: StudioPagePermissionAction; path: string }[],
): Promise<string | null> {
  const state = await resolveWorkspaceAccessFromRequest(slug);
  if (state.status !== "ready") {
    return null;
  }

  for (const item of pagePaths) {
    if (hasPermissionInStatements(state.permissions, "page", item.action)) {
      return item.path;
    }
  }
  return null;
}
