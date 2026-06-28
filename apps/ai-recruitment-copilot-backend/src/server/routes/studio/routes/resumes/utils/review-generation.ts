import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { generateResumeReview } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeReviewGenerationResult } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";

export async function buildJobDescriptionReviewContext(
  organizationId: string,
  jobDescriptionId: string | null,
): Promise<string | null> {
  if (!jobDescriptionId) {
    return null;
  }
  const jd = await loadJobDescriptionById(organizationId, jobDescriptionId);
  if (!jd) {
    return null;
  }
  return [
    `岗位名称：${jd.name}`,
    jd.description ? `岗位描述：${jd.description}` : null,
    `岗位 Prompt：\n${jd.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateResumeReviewBestEffort(input: {
  jobDescriptionId: string | null;
  logPrefix?: string;
  organizationId: string;
  resumeProfile: ResumeProfile;
}): Promise<ResumeReviewGenerationResult | null> {
  try {
    const jobDescription = await buildJobDescriptionReviewContext(
      input.organizationId,
      input.jobDescriptionId,
    );
    const review = await generateResumeReview({
      jobDescription,
      resumeProfile: input.resumeProfile,
    });
    return review.review ? review : null;
  } catch (error) {
    console.error(
      `${input.logPrefix ?? "[resume-library]"} resume review generation failed:`,
      error,
    );
    return null;
  }
}
