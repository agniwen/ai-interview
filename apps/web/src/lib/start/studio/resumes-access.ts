import type { WorkspaceAccessState } from "@/lib/start/auth-session-types";
import { hasPermissionInStatements } from "@app/shared/permission-statements";

export function canReadStudioResumes(
  access: Extract<WorkspaceAccessState, { status: "ready" }>,
): boolean {
  return (
    hasPermissionInStatements(access.permissions, "page", "resumes") &&
    hasPermissionInStatements(access.permissions, "resumeLibrary", "read")
  );
}
