import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { generatedInterviewQuestionSchema } from "@arc/db-schema/interview/types";
import { generateInterviewReport } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report";

const interviewTranscriptTurnSchema = z.object({
  message: z.string().min(1),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().int().min(0).optional(),
});

const interviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  order: z.number().int().min(1),
});

const interviewReportInputSchema = z.object({
  questions: z.array(interviewQuestionSchema),
  transcript: z.array(interviewTranscriptTurnSchema),
});

const interviewReportOutputSchema = z.object({
  evaluation: z.unknown().nullable(),
  evaluationError: z.string().optional(),
  summary: z.string().nullable(),
  summaryError: z.string().optional(),
});

export interface InterviewReportWorkflowDeps {
  generateReport: typeof generateInterviewReport;
}

export function createInterviewReportWorkflow(deps: InterviewReportWorkflowDeps) {
  const generateReportStep = createStep({
    execute: ({ inputData }) => deps.generateReport(inputData),
    id: "generate-interview-report",
    inputSchema: interviewReportInputSchema,
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
      .then(generateReportStep)
      .commit()
  );
}

export const interviewReportWorkflow = createInterviewReportWorkflow({
  generateReport: generateInterviewReport,
});
