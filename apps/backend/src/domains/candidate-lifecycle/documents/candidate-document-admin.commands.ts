export const CANDIDATE_DOCUMENT_ADMIN_COMMANDS = Symbol("CANDIDATE_DOCUMENT_ADMIN_COMMANDS");

export type CandidateDocumentAdminResult =
  | { value: { clearedCount: number }; ok: true }
  | { error: { code: "RESUME_PARSE_CACHE_NOT_FOUND" }; ok: false };

export interface CandidateDocumentAdminCommands {
  resetResumeParseCache(hash: string): Promise<CandidateDocumentAdminResult>;
}
