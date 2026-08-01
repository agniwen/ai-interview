import { hasPermissionInStatements } from "@arc/shared/permission-statements";
import type {
  StudioPagePermissionAction,
  WorkspaceAccessState,
} from "@/lib/start/auth-session-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";

export async function resolveAuthorizedStudioPageAccessFromRequest(
  slug: string,
  action: StudioPagePermissionAction,
): Promise<WorkspaceAccessState> {
  const access = await resolveWorkspaceAccessFromRequest(slug);
  if (access.status !== "ready") {
    return access;
  }
  if (!hasPermissionInStatements(access.permissions, "page", action)) {
    return { status: "not_found" };
  }
  return access;
}
