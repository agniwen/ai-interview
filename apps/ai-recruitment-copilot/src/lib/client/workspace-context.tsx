"use client";
import { createContext, useContext } from "react";

interface WorkspaceContextValue {
  id: string;
  memberRole: string;
  slug: string;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceSlugProvider({
  children,
  id,
  memberRole,
  slug,
}: {
  children: React.ReactNode;
  id: string;
  memberRole: string;
  slug: string;
}) {
  return <Ctx.Provider value={{ id, memberRole, slug }}>{children}</Ctx.Provider>;
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

/**
 * 软变体：返回 string | null。允许组件同时承担 workspace 内与无 workspace 的
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
