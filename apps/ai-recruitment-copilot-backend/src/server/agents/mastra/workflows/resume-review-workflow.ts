import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { WorkflowStreamEvent } from "@mastra/core/stream";
import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import {
  composeResumeReviewResult,
  generateResumeQualitativeReview,
  generateResumeReviewScoring,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { emitMastraWorkflowStreamEvents } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import { resumeScreeningResultSchema } from "@arc/shared/resume-screening";
import type {
  ResumeQualitativeReview,
  ResumeReviewGenerationResult,
  ResumeReviewScoring,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const resumeReviewInputSchema = z.object({
  jobDescription: z.string().nullable().optional(),
  resumeProfile: resumeProfileSchema,
  screeningResult: resumeScreeningResultSchema.nullable().optional(),
});

const resumeReviewOutputSchema = z.object({
  review: z.string(),
  structuredReview: z.unknown(),
});

const qualitativeOutputSchema = resumeReviewInputSchema.extend({
  qualitative: z.unknown().nullable(),
});

const scoringOutputSchema = qualitativeOutputSchema.extend({
  scoring: z.unknown().nullable(),
});

export interface ResumeReviewWorkflowDeps {
  composeReview: typeof composeResumeReviewResult;
  generateQualitativeReview: typeof generateResumeQualitativeReview;
  generateScoring: typeof generateResumeReviewScoring;
}

export function createResumeReviewWorkflow(deps: ResumeReviewWorkflowDeps) {
  const qualitativeReviewStep = createStep({
    execute: async ({ inputData }) => {
      const qualitative = await deps.generateQualitativeReview({
        jobDescription: inputData.jobDescription,
        resumeProfile: inputData.resumeProfile,
        screeningResult: inputData.screeningResult,
      });
      return { ...inputData, qualitative };
    },
    id: "qualitative-review",
    inputSchema: resumeReviewInputSchema,
    outputSchema: qualitativeOutputSchema,
  });

  const scoringStep = createStep({
    execute: async ({ inputData }) => {
      if (!inputData.qualitative) {
        return { ...inputData, scoring: null };
      }
      const scoring = await deps.generateScoring({
        jobDescription: inputData.jobDescription,
        qualitative: inputData.qualitative as ResumeQualitativeReview,
        resumeProfile: inputData.resumeProfile,
        screeningResult: inputData.screeningResult,
      });
      return { ...inputData, scoring };
    },
    id: "scoring",
    inputSchema: qualitativeOutputSchema,
    outputSchema: scoringOutputSchema,
  });

  const composeReviewStep = createStep({
    // oxlint-disable-next-line require-await -- Mastra step execute functions are typed as async.
    execute: async ({ inputData }) => {
      if (!(inputData.qualitative && inputData.scoring)) {
        throw new Error("Resume review workflow reached compose step without review outputs.");
      }
      return deps.composeReview(
        inputData.qualitative as ResumeQualitativeReview,
        inputData.scoring as ResumeReviewScoring,
      );
    },
    id: "compose-review",
    inputSchema: scoringOutputSchema,
    outputSchema: resumeReviewOutputSchema,
  });

  return (
    createWorkflow({
      description: "Run qualitative review and scoring for a resume.",
      id: "resume-review-workflow",
      inputSchema: resumeReviewInputSchema,
      outputSchema: resumeReviewOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(qualitativeReviewStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(scoringStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(composeReviewStep)
      .commit()
  );
}

export const resumeReviewWorkflow = createResumeReviewWorkflow({
  composeReview: composeResumeReviewResult,
  generateQualitativeReview: generateResumeQualitativeReview,
  generateScoring: generateResumeReviewScoring,
});

export async function runResumeReviewWorkflow(
  input: z.input<typeof resumeReviewInputSchema>,
): Promise<ResumeReviewGenerationResult> {
  const run = await resumeReviewWorkflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === "success") {
    return resumeReviewOutputSchema.parse(result.result) as ResumeReviewGenerationResult;
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Resume review workflow ended with status ${result.status}.`);
}

export async function streamResumeReviewWorkflow(
  input: z.input<typeof resumeReviewInputSchema>,
  options: { onWorkflowEvent: (event: AiRunEvent) => void },
): Promise<ResumeReviewGenerationResult> {
  const run = await resumeReviewWorkflow.createRun();
  const output = await run.stream({ inputData: input });
  await emitMastraWorkflowStreamEvents(
    output.fullStream as AsyncIterable<WorkflowStreamEvent>,
    options.onWorkflowEvent,
    {
      stepLabels: {
        "compose-review": "生成评价摘要",
        "qualitative-review": "生成定性评价",
        scoring: "生成维度评分",
      },
      title: "生成简历评价",
      workflowId: "resume-review-workflow",
    },
  );

  const result = await output.result;
  if (result.status === "success") {
    return resumeReviewOutputSchema.parse(result.result) as ResumeReviewGenerationResult;
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Resume review workflow ended with status ${result.status}.`);
}
