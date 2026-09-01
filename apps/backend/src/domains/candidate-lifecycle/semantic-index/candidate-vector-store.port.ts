export const CANDIDATE_VECTOR_STORE = Symbol("CANDIDATE_VECTOR_STORE");

export interface CandidateVectorStore {
  deleteJobDescription(
    organizationId: string,
    jobDescriptionId: string,
  ): Promise<"deleted" | "not_configured">;
}
