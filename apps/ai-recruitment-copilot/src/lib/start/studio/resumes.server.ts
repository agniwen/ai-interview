import { loadResumeLibraryMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";

export async function loadStudioResumesData({ workspaceId }: { workspaceId: string }) {
  return {
    metrics: await loadResumeLibraryMetrics(workspaceId),
  };
}
