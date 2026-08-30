"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { hasPermissionInStatements } from "@arc/shared/permission-statements";
import type {
  PermissionAction,
  PermissionResource,
  WorkspacePermissionStatements,
} from "@arc/shared/permission-statements";
import {
  fetchWorkspaceAccessSnapshot,
  WORKSPACE_PERMISSION_REFRESH_INTERVAL_MS,
  workspaceAccessKeys,
  workspaceAccessSnapshotFromLoader,
} from "@/lib/client/workspace-access-query";
import type { WorkspaceAccessSnapshot } from "@/lib/client/workspace-access-query";

export { WORKSPACE_PERMISSION_REFRESH_INTERVAL_MS, workspaceAccessKeys };

type WorkspaceContextValue = WorkspaceAccessSnapshot;

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceSlugProvider({
  children,
  id,
  memberRole,
  permissions,
  slug,
}: {
  children: React.ReactNode;
  id: string;
  memberRole: string;
  permissions: WorkspacePermissionStatements;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const loaderSnapshot = workspaceAccessSnapshotFromLoader({
    id,
    memberRole,
    permissions,
    slug,
  });

  // Keep the query cache aligned when the route loader re-runs (slug switch / invalidate).
  useEffect(() => {
    queryClient.setQueryData(workspaceAccessKeys.bySlug(slug), loaderSnapshot);
  }, [id, loaderSnapshot, memberRole, permissions, queryClient, slug]);

  const { data } = useQuery({
    initialData: loaderSnapshot,
    // Preserve last good snapshot if a background refetch fails / redirects mid-flight.
    placeholderData: (previous) => previous,
    queryFn: () => fetchWorkspaceAccessSnapshot(slug),
    queryKey: workspaceAccessKeys.bySlug(slug),
    refetchInterval: WORKSPACE_PERMISSION_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    // Loader already hydrated; skip an immediate duplicate mount fetch.
    refetchOnMount: false,
    refetchOnReconnect: true,
    // Focus: always re-pull (pairs with staleTime: 0). Global default is false.
    refetchOnWindowFocus: true,
    // Always stale so every window focus triggers a refetch.
    staleTime: 0,
  });

  const value = data ?? loaderSnapshot;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceSlug(): string {
  const workspace = useContext(Ctx);
  if (!workspace) {
    throw new Error("useWorkspaceSlug must be used within a workspace route (under /w/[slug]/...)");
  }
  return workspace.slug;
}

export function useWorkspaceId(): string {
  const workspace = useContext(Ctx);
  if (!workspace) {
    throw new Error("useWorkspaceId must be used within a workspace route (under /w/[slug]/...)");
  }
  return workspace.id;
}

export function useWorkspaceMemberRole(): string {
  const workspace = useContext(Ctx);
  if (!workspace) {
    throw new Error(
      "useWorkspaceMemberRole must be used within a workspace route (under /w/[slug]/...)",
    );
  }
  return workspace.memberRole;
}

export function useWorkspacePermissions(): WorkspacePermissionStatements {
  const workspace = useContext(Ctx);
  if (!workspace) {
    throw new Error(
      "useWorkspacePermissions must be used within a workspace route (under /w/[slug]/...)",
    );
  }
  return workspace.permissions;
}

/**
 * Soft variant：返回 string | null。允许组件同时承担 workspace 内与无 workspace 的
 * 公开访问入口（例如 /r/[roundId]）。
 *
 * Soft variant: returns string | null so a component can serve both an authed
 * workspace path and a slug-less public route (e.g. /r/[roundId]).
 */
export function useOptionalWorkspaceSlug(): string | null {
  return useContext(Ctx)?.slug ?? null;
}

export function useOptionalWorkspaceId(): string | null {
  return useContext(Ctx)?.id ?? null;
}

export function useOptionalWorkspaceMemberRole(): string | null {
  return useContext(Ctx)?.memberRole ?? null;
}

export function useOptionalWorkspacePermissions(): WorkspacePermissionStatements | null {
  return useContext(Ctx)?.permissions ?? null;
}

/**
 * Local permission check against the workspace permission snapshot.
 * No network request — prefer this for UI gating.
 */
export function useWorkspaceCan<R extends PermissionResource>(
  resource: R,
  action: PermissionAction<R>,
): boolean {
  const permissions = useOptionalWorkspacePermissions();
  return hasPermissionInStatements(permissions, resource, action);
}
