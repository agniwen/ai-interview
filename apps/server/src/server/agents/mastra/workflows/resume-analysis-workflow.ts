import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  generatedInterviewQuestionSchema,
  resumeProfileSchema,
} from "@arc/db-schema/interview/types";
import {
  generateInterviewQuestionsForProfile,
  parseResumeBytesToProfile,
} from "@app/server/server/agents/resume-analysis-agent";

const resumeAnalysisInputSchema = z.object({
  bytesBase64: z.string().min(1),
  fileName: z.string().trim().min(1),
  mediaType: z.string().trim().optional(),
});

const parsedResumeWorkflowOutputSchema = z.object({
  fileName: z.string(),
  resumeProfile: resumeProfileSchema,
  resumeText: z.string().nullable(),
});

const interviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  order: z.number().int().min(1),
});

const resumeAnalysisOutputSchema = parsedResumeWorkflowOutputSchema.extend({
  interviewQuestions: z.array(interviewQuestionSchema),
});

export type ResumeAnalysisWorkflowOutput = z.output<typeof resumeAnalysisOutputSchema>;

export interface ResumeAnalysisWorkflowDeps {
  generateQuestions: typeof generateInterviewQuestionsForProfile;
  parseResume: typeof parseResumeBytesToProfile;
}

export function createResumeAnalysisWorkflow(deps: ResumeAnalysisWorkflowDeps) {
  const parseResumeProfileStep = createStep({
    execute: async ({ inputData }) => {
      const parsed = await deps.parseResume({
        bytes: Buffer.from(inputData.bytesBase64, "base64"),
        fileName: inputData.fileName,
        mediaType: inputData.mediaType,
      });
      return {
        fileName: inputData.fileName,
        resumeProfile: parsed.resumeProfile,
        resumeText: parsed.parsedText,
      };
    },
    id: "run-resume-parse-workflow",
    inputSchema: resumeAnalysisInputSchema,
    outputSchema: parsedResumeWorkflowOutputSchema,
  });

  const generateQuestionsStep = createStep({
    execute: async ({ inputData }) => ({
      ...inputData,
      interviewQuestions: await deps.generateQuestions(inputData.resumeProfile),
    }),
    id: "generate-interview-questions",
    inputSchema: parsedResumeWorkflowOutputSchema,
    outputSchema: resumeAnalysisOutputSchema,
  });

  return (
    createWorkflow({
      description: "Parse a resume document and generate candidate-specific interview questions.",
      id: "resume-analysis-workflow",
      inputSchema: resumeAnalysisInputSchema,
      outputSchema: resumeAnalysisOutputSchema,
    })
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(parseResumeProfileStep)
      // oxlint-disable-next-line prefer-await-to-then -- Mastra workflows compose steps with .then().
      .then(generateQuestionsStep)
      .commit()
  );
}

export const resumeAnalysisWorkflow = createResumeAnalysisWorkflow({
  generateQuestions: generateInterviewQuestionsForProfile,
  parseResume: parseResumeBytesToProfile,
});

export async function runResumeAnalysisWorkflow(
  input: {
    bytes: Uint8Array;
    fileName: string;
    mediaType?: string;
  },
  workflow = resumeAnalysisWorkflow,
): Promise<ResumeAnalysisWorkflowOutput> {
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      bytesBase64: Buffer.from(input.bytes).toString("base64"),
      fileName: input.fileName,
      mediaType: input.mediaType,
    },
  });

  if (result.status === "success") {
    return resumeAnalysisOutputSchema.parse(result.result);
  }
  if (result.status === "failed") {
    throw result.error;
  }
  throw new Error(`Resume analysis workflow ended with status ${result.status}.`);
}
