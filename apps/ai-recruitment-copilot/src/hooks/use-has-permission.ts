"use client";

import type { statement } from "@arc/shared/permissions";
import { useWorkspaceCan } from "@/lib/client/workspace-context";

/**
 * UI permission gate against the workspace permission snapshot.
 *
 * The snapshot is computed once in the `/w/$slug` loader and injected via
 * WorkspaceSlugProvider. Call sites stay the same; no per-(resource,action)
 * hasPermission network requests.
 */
export function useHasPermission<R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
): boolean {
  return useWorkspaceCan(resource, action);
}
