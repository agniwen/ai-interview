import type { CandidateFormTemplateSnapshot } from "@arc/db-schema/candidate-forms";
import type { InterviewQuestionTemplateSnapshot } from "@arc/db-schema/interview-question-templates";

export const CANDIDATE_SETUP_REFRESH_COMMANDS = Symbol("CANDIDATE_SETUP_REFRESH_COMMANDS");

export interface CandidateSetupRefreshResult {
  refreshedCount: number;
  scannedCount: number;
}

interface SetupVersion<TSnapshot> {
  id: string;
  snapshot: TSnapshot;
  version: number;
}

interface SetupRefreshInput<TSnapshot> {
  operatorId: string | null;
  organizationId: string;
  version: SetupVersion<TSnapshot>;
}

export interface CandidateSetupRefreshCommands {
  refreshCandidateForms(
    input: SetupRefreshInput<CandidateFormTemplateSnapshot>,
  ): Promise<CandidateSetupRefreshResult>;
  refreshCommunicationQuestions(
    input: SetupRefreshInput<InterviewQuestionTemplateSnapshot>,
  ): Promise<CandidateSetupRefreshResult>;
}
