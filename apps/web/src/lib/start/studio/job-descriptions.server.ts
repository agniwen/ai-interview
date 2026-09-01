import {
  listAllDepartments,
  listAllInterviewers,
  loadJobDescriptionMetrics,
} from "@app/server/web/studio";

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
