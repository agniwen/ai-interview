import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { canReadStudioResumes } from "./resumes-access";
import type { StudioResumesInput, StudioResumesServerState } from "./resumes.functions";

interface StudioResumesStateDependencies {
  resolveWorkspaceAccess: typeof resolveWorkspaceAccessFromRequest;
}

const defaultStudioResumesStateDependencies: StudioResumesStateDependencies = {
  resolveWorkspaceAccess: resolveWorkspaceAccessFromRequest,
};

export async function loadStudioResumesStateFromRequest(
  data: StudioResumesInput,
  dependencies: StudioResumesStateDependencies = defaultStudioResumesStateDependencies,
): Promise<StudioResumesServerState> {
  const access = await dependencies.resolveWorkspaceAccess(data.slug);
  if (access.status !== "ready") {
    return access;
  }
  if (!canReadStudioResumes(access)) {
    return { status: "not_found" };
  }
  return { status: "ready" };
}
