import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@arc/db-schema/studio-interviews";

export const CANDIDATE_COPILOT_COMMANDS = Symbol("CANDIDATE_COPILOT_COMMANDS");

export interface CandidateCopilotTransitionInput {
  actorId: string;
  closedMeta?: Partial<Omit<ClosedMeta, "previousStage">>;
  closedReason?: string | null;
  organizationId: string;
  outcome?: CandidateOutcome;
  proposalId: string;
  proposalTitle: string;
  reactivationReason?: string;
  resumeRecordId: string;
  targetStage: PipelineStage;
}

export type CandidateCopilotTransitionResult =
  | { kind: "invalid"; message: string }
  | { kind: "not_found" }
  | { kind: "noop" }
  | { kind: "updated" };

export interface CandidateCopilotCommands {
  draftInterviewQuestions(input: {
    actorId: string;
    organizationId: string;
    proposalId: string;
    proposalTitle: string;
    questions: InterviewQuestion[];
    resumeRecordId: string;
  }): Promise<void>;
  transitionCandidate(
    input: CandidateCopilotTransitionInput,
  ): Promise<CandidateCopilotTransitionResult>;
}
