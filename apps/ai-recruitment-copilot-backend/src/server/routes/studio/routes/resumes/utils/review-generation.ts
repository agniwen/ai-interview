import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  generateResumeReview,
  generateResumeScreeningResult,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeScreeningPolicy, ResumeScreeningResult } from "@arc/shared/resume-screening";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { deriveStructuredResumeSummaries } from "@arc/shared/structured-resume-scoring";
import type { loadRecruitingJobDescriptionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  STRUCTURED_RESUME_ENGINE_VERSION,
  STRUCTURED_RESUME_MODEL_ID,
  STRUCTURED_RESUME_PROMPT_VERSION,
} from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import { runStructuredResumeReviewWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/structured-resume-review-workflow";
import type { GeneratedResumeAssessment } from "./review-lifecycle";

interface ResumeReviewContext {
  jobDescription: string | null;
  screeningPolicy: ResumeScreeningPolicy | null;
}

export interface ResumeReviewGenerationDependencies {
  generateReview: typeof generateResumeReview;
  generateScreeningResult: typeof generateResumeScreeningResult;
  loadJobDescription: typeof loadRecruitingJobDescriptionById;
  runStructuredReview: typeof runStructuredResumeReviewWorkflow;
}

const defaultDependencies: ResumeReviewGenerationDependencies = {
  generateReview: generateResumeReview,
  generateScreeningResult: generateResumeScreeningResult,
  loadJobDescription: async (organizationId, jobDescriptionId) => {
    const { loadRecruitingJobDescriptionById: loadJobDescription } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao");
    return loadJobDescription(organizationId, jobDescriptionId);
  },
  runStructuredReview: runStructuredResumeReviewWorkflow,
};

export async function buildJobDescriptionReviewContext(
  organizationId: string,
  jobDescriptionId: string | null,
  dependencies: ResumeReviewGenerationDependencies = defaultDependencies,
): Promise<ResumeReviewContext> {
  if (!jobDescriptionId) {
    return { jobDescription: null, screeningPolicy: null };
  }
  const jd = await dependencies.loadJobDescription(organizationId, jobDescriptionId);
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

export async function generateResumeAssessment(
  input: {
    evaluationAsOf: string;
    jobDescriptionId: string;
    organizationId: string;
    resumeContentHash: string | null;
    resumeInputHash: string;
    resumeProfile: ResumeProfile;
    resumeText?: string | null;
    runId: string;
  },
  dependencies: ResumeReviewGenerationDependencies = defaultDependencies,
): Promise<GeneratedResumeAssessment> {
  const job = await dependencies.loadJobDescription(input.organizationId, input.jobDescriptionId);
  if (!job) {
    throw new Error("绑定岗位不存在或尚未发布。");
  }
  if (job.evaluationMode === "structured") {
    if (!job.evaluationBlueprint || !job.evaluationBlueprintHash || !job.deductionRuleSetVersion) {
      throw new Error("结构化岗位缺少已发布评估蓝图。");
    }
    const evaluation = await dependencies.runStructuredReview({
      engine: {
        modelId: STRUCTURED_RESUME_MODEL_ID,
        promptVersion: STRUCTURED_RESUME_PROMPT_VERSION,
        version: STRUCTURED_RESUME_ENGINE_VERSION,
      },
      jobSnapshot: {
        blueprint: jobEvaluationBlueprintSchema.parse(job.evaluationBlueprint),
        blueprintHash: job.evaluationBlueprintHash,
        deductionRuleSetVersion: job.deductionRuleSetVersion,
        evaluationMode: "structured",
        jobId: job.id,
        publishedConfig: job.structuredConfig,
      },
      resumeInput: {
        evaluationAsOf: input.evaluationAsOf,
        resumeInputHash: input.resumeInputHash,
        resumeProfile: input.resumeProfile,
        resumeText: input.resumeText ?? null,
        runId: input.runId,
      },
    });
    return {
      evaluation,
      mode: "structured",
      summaries: deriveStructuredResumeSummaries(evaluation),
    };
  }
  const context = await buildJobDescriptionReviewContext(
    input.organizationId,
    input.jobDescriptionId,
    dependencies,
  );
  const screeningResult = await dependencies.generateScreeningResult({
    policy: context.screeningPolicy,
    resumeProfile: input.resumeProfile,
    resumeText: input.resumeText,
  });
  const review = await dependencies.generateReview({
    jobDescription: context.jobDescription,
    resumeProfile: input.resumeProfile,
    screeningResult,
  });
  if (!review.review) {
    throw new Error("AI 分析生成失败。");
  }
  return {
    mode: "legacy",
    resumeReview: review.structuredReview,
    review: review.review,
    screeningResult,
  };
}

export async function generateResumeReviewBestEffort(
  input: {
    evaluationAsOf: string;
    jobDescriptionId: string;
    logPrefix?: string;
    organizationId: string;
    resumeContentHash: string | null;
    resumeInputHash: string;
    resumeProfile: ResumeProfile;
    resumeText?: string | null;
    runId: string;
  },
  dependencies: ResumeReviewGenerationDependencies = defaultDependencies,
): Promise<GeneratedResumeAssessment | null> {
  try {
    return await generateResumeAssessment(input, dependencies);
  } catch (error) {
    console.error(
      `${input.logPrefix ?? "[resume-library]"} resume review generation failed:`,
      error,
    );
    return null;
  }
}

export async function generateLegacyResumeReviewBestEffort(input: {
  jobDescriptionId: string;
  logPrefix?: string;
  organizationId: string;
  resumeProfile: ResumeProfile;
  resumeText?: string | null;
}): Promise<{
  resumeReview: Awaited<ReturnType<typeof generateResumeReview>>["structuredReview"];
  review: string;
  screeningResult: ResumeScreeningResult;
} | null> {
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
    return {
      resumeReview: review.structuredReview,
      review: review.review,
      screeningResult,
    };
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
