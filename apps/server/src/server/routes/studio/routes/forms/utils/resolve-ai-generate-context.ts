import { loadInterviewContextsForFormAi } from "@app/server/server/routes/studio/routes/forms/dao/form-ai-context";
import { loadManagedJobDescriptionById } from "@app/server/server/routes/studio/routes/job-descriptions/dao";
import type { AiCandidateContext } from "@app/server/server/routes/studio/routes/forms/utils/ai-candidate-context-format";

export interface AiGenerateJobDescriptionContext {
  name: string;
  prompt: string | null;
}

export function resolveInterviewRecordIds(body: {
  interviewRecordId?: string;
  interviewRecordIds?: string[];
}): string[] {
  if (body.interviewRecordIds?.length) {
    return body.interviewRecordIds;
  }
  if (body.interviewRecordId) {
    return [body.interviewRecordId];
  }
  return [];
}

export async function resolveAiGenerateContext(
  organizationId: string,
  options: {
    interviewRecordIds: string[];
    jobDescriptionId?: string;
    jobDescriptionIds?: string[];
  },
): Promise<
  | {
      candidates: AiCandidateContext[];
      jobDescription: AiGenerateJobDescriptionContext | null;
    }
  | { error: string }
> {
  const { interviewRecordIds, jobDescriptionId, jobDescriptionIds } = options;
  let candidates: AiCandidateContext[] = [];
  let jobDescription: AiGenerateJobDescriptionContext | null = null;

  if (interviewRecordIds.length > 0) {
    const contexts = await loadInterviewContextsForFormAi(organizationId, interviewRecordIds);
    if (!contexts) {
      return { error: "部分所选候选人不存在。" };
    }
    candidates = contexts.map((context) => ({
      candidateName: context.candidateName,
      resumeProfile: context.resumeProfile,
    }));
    const [firstContext] = contexts;
    if (!jobDescriptionId && !jobDescriptionIds?.length && firstContext?.jobDescriptionName) {
      jobDescription = {
        name: firstContext.jobDescriptionName,
        prompt: firstContext.jobDescriptionPrompt ?? null,
      };
    }
  }

  if (jobDescriptionId) {
    const jd = await loadManagedJobDescriptionById(organizationId, jobDescriptionId);
    if (!jd) {
      return { error: "所选岗位不存在。" };
    }
    jobDescription = { name: jd.name, prompt: jd.prompt ?? null };
  } else if (!jobDescription && jobDescriptionIds?.length) {
    const [firstJobDescriptionId] = jobDescriptionIds;
    if (firstJobDescriptionId) {
      const jd = await loadManagedJobDescriptionById(organizationId, firstJobDescriptionId);
      if (jd) {
        jobDescription = { name: jd.name, prompt: jd.prompt ?? null };
      }
    }
  }

  return { candidates, jobDescription };
}
