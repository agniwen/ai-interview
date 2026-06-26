import type { CandidateFormTemplateSnapshot } from "./candidate-forms";
import type {
  InterviewQuestionTemplateScope,
  InterviewQuestionTemplateSnapshot,
} from "./interview-question-templates";
import type { InterviewQuestion, ResumeProfile } from "./interview/types";
import type { InterviewTranscriptTurn } from "./interview-session";

export type InterviewSnapshotStatus = "active" | "superseded";
export type InterviewContextSnapshotReason = "create" | "manual_refresh" | "reset";

export interface InterviewContextSnapshotCandidate {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  resumeProfile: ResumeProfile | null;
  targetRole: string | null;
}

export interface InterviewContextSnapshotJobDescription {
  id: string;
  name: string;
  prompt: string | null;
}

export interface InterviewContextSnapshotGlobalConfig {
  closingInstructions: string | null;
  companyContext: string | null;
  openingInstructions: string | null;
}

export interface InterviewContextSnapshotInterviewer {
  name: string;
  prompt: string | null;
  voice: string | null;
}

export interface InterviewContextSnapshotForm {
  snapshot: CandidateFormTemplateSnapshot;
  templateId: string;
  version: number;
  versionId: string;
}

export interface InterviewContextSnapshotQuestionTemplate {
  bindingId: string;
  disabledByUser: boolean;
  scope: InterviewQuestionTemplateScope;
  snapshot: InterviewQuestionTemplateSnapshot;
  sortOrder: number;
  templateId: string;
  version: number;
  versionId: string;
}

export interface InterviewContextSnapshotPayload {
  candidate: InterviewContextSnapshotCandidate;
  createdAt: string;
  forms: InterviewContextSnapshotForm[];
  globalConfig: InterviewContextSnapshotGlobalConfig;
  interviewRecordId: string;
  interviewers: InterviewContextSnapshotInterviewer[];
  jobDescription: InterviewContextSnapshotJobDescription | null;
  personalizedQuestions: InterviewQuestion[];
  questionTemplates: InterviewContextSnapshotQuestionTemplate[];
  scheduleEntryId: string | null;
  schemaVersion: 1;
}

export interface InterviewEvidenceSnapshotFormSubmission {
  answers: Record<string, string | string[]>;
  snapshot: CandidateFormTemplateSnapshot;
  submittedAt: string;
  templateId: string;
  version: number;
  versionId: string;
}

export interface InterviewEvidenceSnapshotPayload {
  context: InterviewContextSnapshotPayload;
  contextSnapshotId: string;
  conversationId: string;
  formSubmissions: InterviewEvidenceSnapshotFormSubmission[];
  generatedAt: string;
  interviewRecordId: string;
  recording: {
    durationSecs: number | null;
    egressId: string | null;
    fileKey: string | null;
    status: string | null;
  };
  scheduleEntryId: string | null;
  schemaVersion: 1;
  transcript: InterviewTranscriptTurn[];
}
