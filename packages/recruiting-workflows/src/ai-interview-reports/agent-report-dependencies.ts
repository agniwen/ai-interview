import type { CheckpointPayload, ReportPayload, ReportTranscript } from "./report-payload";

export interface RetrySummaryCandidate {
  conversationId: string;
  interviewRecordId: string | null;
}

export interface AgentRouterDependencies {
  receiveReport: (data: ReportPayload, dependencies: AgentRouterDependencies) => Promise<void>;

  createInterviewEvidenceSnapshot: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  findExistingTranscript: (conversationId: string) => Promise<ReportTranscript | null>;
  hasKeyInformationColumns: () => Promise<boolean>;
  listKeyInformationRetryCandidates: (staleThreshold: Date) => Promise<RetrySummaryCandidate[]>;
  listSummaryRetryCandidates: (staleThreshold: Date) => Promise<RetrySummaryCandidate[]>;
  notifyInterviewSummaryReady: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  persistCheckpoint: (options: {
    data: CheckpointPayload;
    now: Date;
    organizationId: string;
  }) => Promise<void>;
  persistReport: (options: {
    data: ReportPayload;
    isNewTranscript: boolean;
    keyInformationColumnsAvailable: boolean;
    now: Date;
    organizationId: string;
  }) => Promise<boolean>;
  resolveOrgFromInterview: (interviewRecordId: string) => Promise<string>;
  retryFailedInterviewSummaryNotifications: () => Promise<{ retried: number }>;
  runKeyInformationJob: (options: {
    conversationId: string;
    interviewRecordId: string;
  }) => Promise<void>;
  runSummaryJob: (options: { conversationId: string; interviewRecordId: string }) => Promise<void>;
}
