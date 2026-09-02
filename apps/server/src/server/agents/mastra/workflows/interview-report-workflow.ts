import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { generatedInterviewQuestionSchema } from "@app/db-schema/interview/types";
import { interviewDataCollectionResultsSchema } from "@app/shared/interview/question-outcomes";
import {
  composeInterviewReport,
  generateInterviewEvaluation,
  generateInterviewSummary,
  interviewEvaluationSchema,
} from "../../../routes/agent/utils/interview-report";

const interviewTranscriptTurnSchema = z.object({
  message: z.string().min(1),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().int().min(0).optional(),
});

const interviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  order: z.number().int().min(1),
  questionId: z.string().min(1),
});

const interviewReportInputSchema = z.object({
  candidateFormResponses: z.string(),
  dataCollectionResults: interviewDataCollectionResultsSchema.nullable(),
  questions: z.array(interviewQuestionSchema),
  transcript: z.array(interviewTranscriptTurnSchema),
});

const interviewReportOutputSchema = z.object({
  evaluation: z.unknown().nullable(),
  evaluationError: z.string().optional(),
  summary: z.string().nullable(),
  summaryError: z.string().optional(),
});

export type InterviewReportWorkflowOutput = z.output<typeof interviewReportOutputSchema>;

const settledStringSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("fulfilled"), value: z.string() }),
  z.object({ reason: z.string(), status: z.literal("rejected") }),
]);

const settledEvaluationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("fulfilled"), value: interviewEvaluationSchema }),
  z.object({ reason: z.string(), status: z.literal("rejected") }),
]);

const summaryOutputSchema = interviewReportInputSchema.extend({
  summaryResult: settledStringSchema,
});

const evaluationOutputSchema = interviewReportInputSchema.extend({
  evaluationResult: settledEvaluationSchema,
});

const reportGenerationOutputSchema = z.object({
  evaluation: evaluationOutputSchema,
  summary: summaryOutputSchema,
});

export interface InterviewReportWorkflowDeps {
  composeReport: typeof composeInterviewReport;
  generateEvaluation: typeof generateInterviewEvaluation;
  generateSummary: typeof generateInterviewSummary;
}

export function createInterviewReportWorkflow(deps: InterviewReportWorkflowDeps) {
  const loadConversationStep = createStep({
    // oxlint-disable-next-line require-await -- Mastra step execute functions are typed as async.
    execute: async ({ inputData }) => inputData,
    id: "load-interview-conversation",
    inputSchema: interviewReportInputSchema,
    outputSchema: interviewReportInputSchema,
  });

  const summaryStep = createStep({
    execute: async ({ inputData }) => {
      try {
        return {
          ...inputData,
          summaryResult: {
            status: "fulfilled" as const,
            value: await deps.generateSummary({ transcript: inputData.transcript }),
          },
        };
      } catch (error) {
        return {
          ...inputData,
          summaryResult: {
            reason: error instanceof Error ? error.message : String(error),
            status: "rejected" as const,
          },
        };
      }
    },
    id: "summary",
    inputSchema: interviewReportInputSchema,
    outputSchema: summaryOutputSchema,
  });

  const evaluationStep = createStep({
    execute: async ({ inputData }) => {
      try {
        return {
          ...inputData,
          evaluationResult: {
            status: "fulfilled" as const,
            value: await deps.generateEvaluation({
              candidateFormResponses: inputData.candidateFormResponses,
              dataCollectionResults: inputData.dataCollectionResults,
              questions: inputData.questions,
              transcript: inputData.transcript,
            }),
          },
        };
      } catch (error) {
        return {
          ...inputData,
          evaluationResult: {
            reason: error instanceof Error ? error.message : String(error),
            status: "rejected" as const,
          },
        };
      }
    },
    id: "evaluation",
    inputSchema: interviewReportInputSchema,
    outputSchema: evaluationOutputSchema,
  });

  const composeReportStep = createStep({
    // oxlint-disable-next-line require-await -- Mastra step execute functions are typed as async.
    execute: async ({ inputData }) =>
      deps.composeReport({
        evaluationResult: inputData.evaluation.evaluationResult,
        summaryResult: inputData.summary.summaryResult,
      }),
    id: "compose-interview-report",
    inputSchema: reportGenerationOutputSchema,
    outputSchema: interviewReportOutputSchema,
  });

  return (
    createWorkflow({
      description: "Generate interview summary and structured evaluation from a transcript.",
      id: "interview-report-workflow",
      inputSchema: interviewReportInputSchema,
      outputSchema: interviewReportOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(loadConversationStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose branches with .parallel().
      .parallel([summaryStep, evaluationStep])
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(composeReportStep)
      .commit()
  );
}

export const interviewReportWorkflow = createInterviewReportWorkflow({
  composeReport: composeInterviewReport,
  generateEvaluation: generateInterviewEvaluation,
  generateSummary: generateInterviewSummary,
});

export async function runInterviewReportWorkflow(
  input: {
    candidateFormResponses: z.input<typeof interviewReportInputSchema>["candidateFormResponses"];
    dataCollectionResults: z.input<typeof interviewReportInputSchema>["dataCollectionResults"];
    questions: z.input<typeof interviewReportInputSchema>["questions"];
    transcript: z.input<typeof interviewReportInputSchema>["transcript"];
  },
  workflow = interviewReportWorkflow,
): Promise<InterviewReportWorkflowOutput> {
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === "success") {
    return interviewReportOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Interview report workflow ended with status ${result.status}.`);
}
