import { z } from "zod";
import type { InterviewContextSnapshotInterviewer } from "@arc/db-schema/interview-snapshots";
import {
  buildAgentInstructions,
  resolveClosingPrompt,
  resolveOpeningPrompt,
} from "@arc/shared/interview/agent-instructions";
import type { AgentInstructionContext } from "@arc/shared/interview/agent-instructions";

export const INTERVIEW_DISPATCH_SCHEMA_VERSION = 1 as const;

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

export const interviewDispatchContractSchema = z
  .object({
    candidate: candidateSchema,
    prompts: promptsSchema,
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

/**
 * Expand-contract metadata for rolling Backend → Agent deployments.
 *
 * V1 consumers use the versioned camelCase contract. The temporary snake_case
 * fields let an older Python worker finish jobs while Backend replicas roll
 * forward. Deploy Backend completely before deploying the V1 Agent, then remove
 * this compatibility envelope in a later release.
 */
export function buildInterviewDispatchMetadata(input: InterviewDispatchContractInput) {
  const contract = buildInterviewDispatchContract(input);
  return {
    ...contract,
    allow_text_input: contract.session.allowTextInput,
    candidate_name: contract.candidate.name,
    candidate_profile: input.resumeProfile,
    global_closing_instructions: input.closingInstructions ?? null,
    global_company_context: input.companyContext ?? null,
    global_opening_instructions: input.openingInstructions ?? null,
    interview_questions: input.interviewQuestions,
    interview_record_id: contract.session.interviewRecordId,
    interviewers: input.selectedInterviewer ? [input.selectedInterviewer] : [],
    job_description_preset_questions: input.jobDescriptionPresetQuestions,
    job_description_prompt: input.jobDescriptionPrompt ?? null,
    recording_enabled: contract.recording.enabled,
    recording_file_key: contract.recording.fileKey,
    round_id: contract.session.roundId,
    target_role: contract.candidate.targetRole,
  };
}
