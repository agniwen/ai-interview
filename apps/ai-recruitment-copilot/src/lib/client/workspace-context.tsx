"use client";
import "client-only";

import { createContext, useContext } from "react";

const Ctx = createContext<string | null>(null);

export function WorkspaceSlugProvider({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={slug}>{children}</Ctx.Provider>;
}

export function useWorkspaceSlug(): string {
  const slug = useContext(Ctx);
  if (!slug) {
    throw new Error("useWorkspaceSlug must be used within a workspace route (under /w/[slug]/...)");
  }
  return slug;
}

/**
 * 软变体：返回 string | null。允许组件同时承担 workspace 内与无 workspace 的
 * 公开访问入口（例如 /r/[roundId]）。
 *
 * Soft variant: returns string | null so a component can serve both an authed
 * workspace path and a slug-less public route (e.g. /r/[roundId]).
 */
export function useOptionalWorkspaceSlug(): string | null {
  return useContext(Ctx);
}
