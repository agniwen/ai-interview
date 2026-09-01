export const CANDIDATE_RECOVERY_COMMANDS = Symbol("CANDIDATE_RECOVERY_COMMANDS");

export interface RecoverableResumeParse {
  batchId: string;
  bypassCache?: boolean;
  itemId: string;
  organizationId: string;
  userId: string;
}

export interface RecoverableResumeSemanticIndex {
  organizationId: string;
  sourceId: string;
  sourceType: "job_description" | "resume_pool_item" | "studio_interview";
}

export interface CandidateRecoveryCommands {
  listRecoverableResumeParseJobs(): Promise<RecoverableResumeParse[]>;
  listRecoverableResumeSemanticIndexJobs(): Promise<RecoverableResumeSemanticIndex[]>;
}
