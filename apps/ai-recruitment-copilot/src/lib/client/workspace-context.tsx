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
