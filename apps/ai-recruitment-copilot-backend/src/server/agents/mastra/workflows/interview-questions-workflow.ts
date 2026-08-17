import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { WorkflowStreamEvent } from "@mastra/core/stream";
import { z } from "zod";
import {
  generatedInterviewQuestionSchema,
  resumeProfileSchema,
} from "@arc/db-schema/interview/types";
import { generateInterviewQuestionsForProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { AiRunEvent } from "@arc/shared/ai-run-events";
import { emitMastraWorkflowStreamEvents } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/ai-run-stream";

const interviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  order: z.number().int().min(1),
});

const interviewQuestionsOutputSchema = z.object({
  interviewQuestions: z.array(interviewQuestionSchema),
});

export type InterviewQuestionsWorkflowOutput = z.output<typeof interviewQuestionsOutputSchema>;

export interface InterviewQuestionsWorkflowDeps {
  generateQuestions: typeof generateInterviewQuestionsForProfile;
}

export function createInterviewQuestionsWorkflow(deps: InterviewQuestionsWorkflowDeps) {
  const generateQuestionsStep = createStep({
    execute: async ({ inputData }) => ({
      interviewQuestions: await deps.generateQuestions(inputData),
    }),
    id: "generate-interview-questions",
    inputSchema: resumeProfileSchema,
    outputSchema: interviewQuestionsOutputSchema,
  });

  return (
    createWorkflow({
      description: "Generate candidate-specific interview questions from a parsed resume profile.",
      id: "interview-questions-workflow",
      inputSchema: resumeProfileSchema,
      outputSchema: interviewQuestionsOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(generateQuestionsStep)
      .commit()
  );
}

export const interviewQuestionsWorkflow = createInterviewQuestionsWorkflow({
  generateQuestions: generateInterviewQuestionsForProfile,
});

export async function runInterviewQuestionsWorkflow(
  input: z.input<typeof resumeProfileSchema>,
): Promise<InterviewQuestionsWorkflowOutput> {
  const run = await interviewQuestionsWorkflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === "success") {
    return interviewQuestionsOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Interview questions workflow ended with status ${result.status}.`);
}

export async function streamInterviewQuestionsWorkflow(
  input: z.input<typeof resumeProfileSchema>,
  options: { onWorkflowEvent: (event: AiRunEvent) => void },
  workflow = interviewQuestionsWorkflow,
): Promise<InterviewQuestionsWorkflowOutput> {
  const run = await workflow.createRun();
  const output = await run.stream({ inputData: input });
  await emitMastraWorkflowStreamEvents(
    // SAFETY: Mastra's run.stream() contract exposes fullStream as an async iterable of workflow events.
    output.fullStream as AsyncIterable<WorkflowStreamEvent>,
    options.onWorkflowEvent,
    {
      stepLabels: { "generate-interview-questions": "生成面试题" },
      title: "生成面试题",
      workflowId: "interview-questions-workflow",
    },
  );

  const result = await output.result;
  if (result.status === "success") {
    return interviewQuestionsOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Interview questions workflow ended with status ${result.status}.`);
}
