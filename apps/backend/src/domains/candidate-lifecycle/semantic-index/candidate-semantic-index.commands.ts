export const CANDIDATE_SEMANTIC_INDEX_COMMANDS = Symbol("CANDIDATE_SEMANTIC_INDEX_COMMANDS");

export interface CandidateSemanticIndexCommands {
  deleteJobDescription(organizationId: string, jobDescriptionId: string): Promise<void>;
}
