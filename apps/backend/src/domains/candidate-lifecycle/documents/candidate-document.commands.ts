import type { AttachmentParseStatus, AttachmentTextSource } from "@arc/db-schema/db-enums";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";

export const CANDIDATE_DOCUMENT_COMMANDS = Symbol("CANDIDATE_DOCUMENT_COMMANDS");

export interface CandidateDocumentCreateInput {
  contentHash: string | null;
  filename: string;
  id: string;
  mediaType: string;
  organizationId: string;
  parsedAt?: Date | null;
  parsedError?: string | null;
  parsedPageCount?: number | null;
  parsedStatus: AttachmentParseStatus;
  parsedStructured?: ResumeParserStructured | null;
  parsedText?: string | null;
  parsedTextSource?: AttachmentTextSource | null;
  size: number;
  storageKey: string;
  userId: string;
}

export interface CandidateDocumentCommands {
  create(input: CandidateDocumentCreateInput): Promise<void>;
  completeParseByHash(input: {
    contentHash: string;
    parsedAt: Date;
    parsedPageCount: number;
    parsedStructured: ResumeParserStructured;
    parsedText: string;
    parsedTextSource: AttachmentTextSource;
  }): Promise<void>;
  storeStructuredParseByHash(input: {
    contentHash: string;
    filename: string;
    parsedStructured: ResumeParserStructured;
  }): Promise<void>;
}
