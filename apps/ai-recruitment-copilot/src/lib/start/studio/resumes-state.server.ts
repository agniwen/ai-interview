import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { canReadStudioResumes } from "./resumes-access";
import type { StudioResumesInput, StudioResumesServerState } from "./resumes.functions";
import { loadStudioResumesData } from "./resumes.server";

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
  if (!data.prefetchList) {
    return { mode: "nested", status: "ready" };
  }

  const visibilityScope = await resolveRecruitingVisibilityScope({
    currentRole: access.member.role,
    organizationId: access.workspace.id,
    userId: access.user.id,
  });

  return {
    ...(await loadStudioResumesData({
      prefetchList: true,
      query: data.query,
      slug: data.slug,
      visibilityScope,
      workspaceId: access.workspace.id,
    })),
    mode: "list",
    status: "ready",
  };
}
