import { notFound } from "@tanstack/react-router";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import type {
  StudioPagePermissionAction,
  WorkspaceAccessState,
} from "@/lib/start/auth-session-types";

/**
 * Checks Studio page access from each page route's own loader. The Studio layout match is shared
 * by every page (and cached by intent preloads), so a pathname-based check there can be skipped
 * when navigating between pages.
 */
export async function requireStudioPagePermission(
  studioMatchPromise: Promise<{ loaderData?: WorkspaceAccessState | null }>,
  action: StudioPagePermissionAction,
) {
  const { loaderData: state } = await studioMatchPromise;
  if (state?.status !== "ready" || !hasPermissionInStatements(state.permissions, "page", action)) {
    throw notFound();
  }
}
