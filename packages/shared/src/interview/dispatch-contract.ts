import { z } from "zod";
import type { InterviewContextSnapshotInterviewer } from "@arc/db-schema/interview-snapshots";
import {
  buildAgentInstructions,
  resolveClosingPrompt,
  resolveOpeningPrompt,
} from "@arc/shared/interview/agent-instructions";
import type { AgentInstructionContext } from "@arc/shared/interview/agent-instructions";

export const INTERVIEW_DISPATCH_SCHEMA_VERSION = 2 as const;

const sessionSchema = z
  .object({
    allowTextInput: z.boolean(),
    interviewRecordId: z.string().min(1),
    roundId: z.string().min(1),
  })
  .strict();

const candidateSchema = z
  .object({
    name: z.string().min(1),
    targetRole: z.string().min(1),
  })
  .strict();

const recordingSchema = z
  .object({
    enabled: z.boolean(),
    fileKey: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((recording, context) => {
    if (recording.enabled && !recording.fileKey) {
      context.addIssue({
        code: "custom",
        message: "fileKey is required when recording is enabled",
        path: ["fileKey"],
      });
    }
  });

const selectedInterviewerSchema = z
  .object({
    name: z.string().min(1),
    voice: z.string().min(1).nullable(),
  })
  .strict();

const promptsSchema = z
  .object({
    closing: z.string().min(1),
    opening: z.string().min(1),
    system: z.string().min(1),
  })
  .strict();

const questionSchema = z
  .object({
    content: z.string().trim().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    evaluationFocus: z.string().trim().min(1).nullable(),
    followUpDirections: z.string().trim().min(1).nullable(),
    id: z.string().trim().min(1),
  })
  .strict();

export const interviewDispatchContractSchema = z
  .object({
    candidate: candidateSchema,
    prompts: promptsSchema,
    questions: z.array(questionSchema).min(1),
    recording: recordingSchema,
    schemaVersion: z.literal(INTERVIEW_DISPATCH_SCHEMA_VERSION),
    selectedInterviewer: selectedInterviewerSchema.nullable(),
    session: sessionSchema,
  })
  .strict();

export type InterviewDispatchContract = z.infer<typeof interviewDispatchContractSchema>;

export interface InterviewDispatchContractInput extends Omit<
  AgentInstructionContext,
  "interviewerPrompt"
> {
  allowTextInput: boolean;
  closingInstructions: string | null | undefined;
  interviewRecordId: string;
  openingInstructions: string | null | undefined;
  recordingEnabled: boolean;
  recordingFileKey: string | null;
  roundId: string;
  selectedInterviewer: InterviewContextSnapshotInterviewer | null;
}

export function selectInterviewDispatchInterviewer(
  interviewers: InterviewContextSnapshotInterviewer[],
  selectionKey: string,
): InterviewContextSnapshotInterviewer | null {
  if (interviewers.length === 0) {
    return null;
  }
  let hash = 0;
  for (const character of selectionKey) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 2_147_483_647;
  }
  const index = hash % interviewers.length;
  return interviewers[index] ?? null;
}

export function buildInterviewDispatchContract(
  input: InterviewDispatchContractInput,
): InterviewDispatchContract {
  const candidateName = input.candidateName.trim() || "候选人";
  const targetRole = input.targetRole?.trim() || "未指定岗位";
  const selectedInterviewer = input.selectedInterviewer
    ? {
        name: input.selectedInterviewer.name.trim() || "AI 面试官",
        voice: input.selectedInterviewer.voice?.trim() || null,
      }
    : null;
  const contract = {
    candidate: {
      name: candidateName,
      targetRole,
    },
    prompts: {
      closing: resolveClosingPrompt(input.closingInstructions, candidateName, targetRole),
      opening: resolveOpeningPrompt(input.openingInstructions, candidateName, targetRole),
      system: buildAgentInstructions({
        ...input,
        candidateName,
        interviewerPrompt: input.selectedInterviewer?.prompt ?? null,
        targetRole,
      }),
    },
    questions: input.jobDescriptionPresetQuestions.map((question) => ({
      content: question.content,
      difficulty: question.difficulty,
      evaluationFocus: question.evaluationFocus?.trim() || null,
      followUpDirections: question.followUpDirections?.trim() || null,
      id: question.id,
    })),
    recording: {
      enabled: input.recordingEnabled,
      fileKey: input.recordingFileKey,
    },
    schemaVersion: INTERVIEW_DISPATCH_SCHEMA_VERSION,
    selectedInterviewer,
    session: {
      allowTextInput: input.allowTextInput,
      interviewRecordId: input.interviewRecordId,
      roundId: input.roundId,
    },
  };

  return interviewDispatchContractSchema.parse(contract);
}

export function buildInterviewDispatchMetadata(input: InterviewDispatchContractInput) {
  return buildInterviewDispatchContract(input);
}
