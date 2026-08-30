import { listAllDepartments } from "@app/server/server/routes/studio/routes/departments/dao";
import { listAllInterviewers } from "@app/server/server/routes/studio/routes/interviewers/dao";
import { loadJobDescriptionMetrics } from "@app/server/server/routes/studio/routes/job-descriptions/dao";

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
