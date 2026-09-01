import { listAllJobDescriptions } from "@app/server/web/studio";

export async function loadStudioFormsData({ workspaceId }: { workspaceId: string }) {
  return {
    jobDescriptions: await listAllJobDescriptions(workspaceId),
  };
}
