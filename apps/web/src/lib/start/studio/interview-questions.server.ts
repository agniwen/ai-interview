import { listAllJobDescriptions } from "@app/server/web/studio";

export async function loadStudioInterviewQuestionsData({ workspaceId }: { workspaceId: string }) {
  return {
    jobDescriptions: await listAllJobDescriptions(workspaceId),
  };
}
