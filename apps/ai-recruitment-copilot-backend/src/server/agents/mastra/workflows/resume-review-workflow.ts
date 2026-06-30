import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { generateResumeReview } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const resumeReviewInputSchema = z.object({
  jobDescription: z.string().nullable().optional(),
  resumeProfile: resumeProfileSchema,
});

const resumeReviewOutputSchema = z.object({
  review: z.string(),
  structuredReview: z.unknown(),
});

export interface ResumeReviewWorkflowDeps {
  generateReview: typeof generateResumeReview;
}

export function createResumeReviewWorkflow(deps: ResumeReviewWorkflowDeps) {
  const generateReviewStep = createStep({
    execute: ({ inputData }) => deps.generateReview(inputData),
    id: "generate-resume-review",
    inputSchema: resumeReviewInputSchema,
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
      .then(generateReviewStep)
      .commit()
  );
}

export const resumeReviewWorkflow = createResumeReviewWorkflow({
  generateReview: generateResumeReview,
});
