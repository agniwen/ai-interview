import { hasPermissionInStatements } from "@arc/shared/permission-statements";
import type {
  StudioPagePermissionAction,
  WorkspaceAccessState,
} from "@/lib/start/auth-session-types";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";

interface StudioPageAccessDependencies {
  resolveWorkspaceAccess: typeof resolveWorkspaceAccessFromRequest;
}

const defaultStudioPageAccessDependencies: StudioPageAccessDependencies = {
  resolveWorkspaceAccess: resolveWorkspaceAccessFromRequest,
};

export async function resolveAuthorizedStudioPageAccessFromRequest(
  slug: string,
  action: StudioPagePermissionAction,
  dependencies: StudioPageAccessDependencies = defaultStudioPageAccessDependencies,
): Promise<WorkspaceAccessState> {
  const access = await dependencies.resolveWorkspaceAccess(slug);
  if (access.status !== "ready") {
    return access;
  }
  if (!hasPermissionInStatements(access.permissions, "page", action)) {
    return { status: "not_found" };
  }
  return access;
}
