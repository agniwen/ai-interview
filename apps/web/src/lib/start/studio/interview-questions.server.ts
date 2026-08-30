import { listAllJobDescriptions } from "@app/server/server/routes/studio/routes/job-descriptions/dao";

export async function loadStudioInterviewQuestionsData({ workspaceId }: { workspaceId: string }) {
  return {
    jobDescriptions: await listAllJobDescriptions(workspaceId),
  };
}
