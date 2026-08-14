import { listAllJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";

export async function loadStudioInterviewQuestionsData({ workspaceId }: { workspaceId: string }) {
  return {
    jobDescriptions: await listAllJobDescriptions(workspaceId),
  };
}
