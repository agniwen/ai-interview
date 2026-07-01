import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { WorkflowStreamEvent } from "@mastra/core/stream";
import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import {
  buildHardFilterRejectReview,
  composeResumeReviewResult,
  generateResumeQualitativeReview,
  generateResumeReviewScoring,
  runResumeReviewHardFilter,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { emitMastraWorkflowStreamEvents } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";
import type {
  ResumeQualitativeReview,
  ResumeReviewGenerationResult,
  ResumeReviewScoring,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const resumeReviewInputSchema = z.object({
  jobDescription: z.string().nullable().optional(),
  resumeProfile: resumeProfileSchema,
});

const hardFilterViolationSchema = z.object({
  description: z.string(),
  field: z.string(),
  impact: z.string(),
});

const hardFilterResultSchema = z
  .object({
    semanticRequirements: z.array(z.string()).nullable(),
    violations: z.array(hardFilterViolationSchema),
  })
  .nullable();

const resumeReviewOutputSchema = z.object({
  review: z.string(),
  structuredReview: z.unknown(),
});

const hardFilterOutputSchema = resumeReviewInputSchema.extend({
  hardFilterResult: hardFilterResultSchema,
  rejectReview: resumeReviewOutputSchema.nullable(),
});

const qualitativeOutputSchema = hardFilterOutputSchema.extend({
  qualitative: z.unknown().nullable(),
});

const scoringOutputSchema = qualitativeOutputSchema.extend({
  scoring: z.unknown().nullable(),
});

export interface ResumeReviewWorkflowDeps {
  buildRejectReview: typeof buildHardFilterRejectReview;
  composeReview: typeof composeResumeReviewResult;
  generateQualitativeReview: typeof generateResumeQualitativeReview;
  generateScoring: typeof generateResumeReviewScoring;
  runHardFilter: typeof runResumeReviewHardFilter;
}

export function createResumeReviewWorkflow(deps: ResumeReviewWorkflowDeps) {
  const hardFilterStep = createStep({
    execute: async ({ inputData }) => {
      const hardFilterResult = await deps.runHardFilter(
        inputData.resumeProfile,
        inputData.jobDescription,
      );
      const rejectReview =
        hardFilterResult && hardFilterResult.violations.length > 0
          ? deps.buildRejectReview(hardFilterResult.violations)
          : null;
      return { ...inputData, hardFilterResult, rejectReview };
    },
    id: "hard-filter",
    inputSchema: resumeReviewInputSchema,
    outputSchema: hardFilterOutputSchema,
  });

  const qualitativeReviewStep = createStep({
    execute: async ({ inputData }) => {
      if (inputData.rejectReview) {
        return { ...inputData, qualitative: null };
      }
      const qualitative = await deps.generateQualitativeReview({
        jobDescription: inputData.jobDescription,
        resumeProfile: inputData.resumeProfile,
        semanticRequirements: inputData.hardFilterResult?.semanticRequirements ?? null,
      });
      return { ...inputData, qualitative };
    },
    id: "qualitative-review",
    inputSchema: hardFilterOutputSchema,
    outputSchema: qualitativeOutputSchema,
  });

  const scoringStep = createStep({
    execute: async ({ inputData }) => {
      if (inputData.rejectReview || !inputData.qualitative) {
        return { ...inputData, scoring: null };
      }
      const scoring = await deps.generateScoring({
        jobDescription: inputData.jobDescription,
        qualitative: inputData.qualitative as ResumeQualitativeReview,
        resumeProfile: inputData.resumeProfile,
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
      if (inputData.rejectReview) {
        return inputData.rejectReview;
      }
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
      description: "Run hard filter, qualitative review, and scoring for a resume.",
      id: "resume-review-workflow",
      inputSchema: resumeReviewInputSchema,
      outputSchema: resumeReviewOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(hardFilterStep)
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
  buildRejectReview: buildHardFilterRejectReview,
  composeReview: composeResumeReviewResult,
  generateQualitativeReview: generateResumeQualitativeReview,
  generateScoring: generateResumeReviewScoring,
  runHardFilter: runResumeReviewHardFilter,
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
        "hard-filter": "检查硬性门槛",
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
