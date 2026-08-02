import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { canReadStudioResumes } from "./resumes-access";
import type { StudioResumesInput, StudioResumesServerState } from "./resumes.functions";

export async function loadStudioResumesStateFromRequest(
  data: StudioResumesInput,
): Promise<StudioResumesServerState> {
  const access = await resolveWorkspaceAccessFromRequest(data.slug);
  if (access.status !== "ready") {
    return access;
  }
  if (!canReadStudioResumes(access)) {
    return { status: "not_found" };
  }
  return { status: "ready" };
}
