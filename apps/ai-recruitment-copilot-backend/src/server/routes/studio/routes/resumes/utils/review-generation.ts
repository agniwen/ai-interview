import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  generateResumeReview,
  generateResumeScreeningResult,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeReviewGenerationResult } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeScreeningPolicy, ResumeScreeningResult } from "@arc/shared/resume-screening";
import { loadJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";

interface ResumeReviewContext {
  jobDescription: string | null;
  screeningPolicy: ResumeScreeningPolicy | null;
}

export async function buildJobDescriptionReviewContext(
  organizationId: string,
  jobDescriptionId: string | null,
): Promise<ResumeReviewContext> {
  if (!jobDescriptionId) {
    return { jobDescription: null, screeningPolicy: null };
  }
  const jd = await loadJobDescriptionById(organizationId, jobDescriptionId);
  if (!jd) {
    return { jobDescription: null, screeningPolicy: null };
  }
  const jobDescription = [
    `岗位名称：${jd.name}`,
    jd.description ? `岗位描述：${jd.description}` : null,
    `岗位 Prompt：\n${jd.prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { jobDescription, screeningPolicy: jd.resumeScreeningPolicy };
}

export async function generateResumeReviewBestEffort(input: {
  jobDescriptionId: string | null;
  logPrefix?: string;
  organizationId: string;
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
}): Promise<(ResumeReviewGenerationResult & { screeningResult: ResumeScreeningResult }) | null> {
  try {
    const context = await buildJobDescriptionReviewContext(
      input.organizationId,
      input.jobDescriptionId,
    );
    const screeningResult = await generateResumeScreeningResult({
      policy: context.screeningPolicy,
      resumeProfile: input.resumeProfile,
      resumeText: input.resumeText,
    });
    const review = await generateResumeReview({
      jobDescription: context.jobDescription,
      resumeProfile: input.resumeProfile,
      screeningResult,
    });
    return review.review ? { ...review, screeningResult } : null;
  } catch (error) {
    console.error(
      `${input.logPrefix ?? "[resume-library]"} resume review generation failed:`,
      error,
    );
    return null;
  }
}

export async function generateResumeScreeningBestEffort(input: {
  jobDescriptionId: string | null;
  logPrefix?: string;
  organizationId: string;
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
}): Promise<ResumeScreeningResult | null> {
  try {
    const context = await buildJobDescriptionReviewContext(
      input.organizationId,
      input.jobDescriptionId,
    );
    return await generateResumeScreeningResult({
      policy: context.screeningPolicy,
      resumeProfile: input.resumeProfile,
      resumeText: input.resumeText,
    });
  } catch (error) {
    console.error(
      `${input.logPrefix ?? "[resume-library]"} resume screening generation failed:`,
      error,
    );
    return null;
  }
}
