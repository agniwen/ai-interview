import { listAllDepartments } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";
import { listAllInterviewers } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";
import { loadJobDescriptionMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";

export async function loadStudioJobDescriptionsData({ workspaceId }: { workspaceId: string }) {
  const [departments, interviewers, metrics] = await Promise.all([
    listAllDepartments(workspaceId),
    listAllInterviewers(workspaceId),
    loadJobDescriptionMetrics(workspaceId),
  ]);

  return {
    departments,
    interviewers,
    metrics,
  };
}
