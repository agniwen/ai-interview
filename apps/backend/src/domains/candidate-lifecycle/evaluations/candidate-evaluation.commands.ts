export const CANDIDATE_EVALUATION_COMMANDS = Symbol("CANDIDATE_EVALUATION_COMMANDS");

export interface CandidateEvaluationCommands {
  invalidateInFlightForJob(organizationId: string, jobDescriptionId: string): Promise<number>;
}
