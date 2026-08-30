import { listAllDepartments } from "@app/server/server/routes/studio/routes/departments/dao";

export async function loadStudioInterviewersData({ workspaceId }: { workspaceId: string }) {
  return {
    departments: await listAllDepartments(workspaceId),
  };
}
