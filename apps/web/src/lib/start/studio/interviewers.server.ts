import { listAllDepartments } from "@app/server/web/studio";

export async function loadStudioInterviewersData({ workspaceId }: { workspaceId: string }) {
  return {
    departments: await listAllDepartments(workspaceId),
  };
}
