export const MEETING_RECOVERY_COMMANDS = Symbol("MEETING_RECOVERY_COMMANDS");

export interface RecoverableMeetingAnswer {
  exchangeId: string;
}

export interface RecoverableMeetingIntelligence {
  processingRunId: string;
}

export interface RecoverableMeetingPlayback {
  meetingId: string;
  organizationId: string;
}

export type RecoverableMeetingPurge = RecoverableMeetingPlayback;

export interface RecoverableMeetingTranscription {
  meetingId: string;
  model: string;
  organizationId: string;
  pipelineVersion: "final-v1";
  policyRevision: number;
  provider: "deepgram" | "openai" | "qwen" | "tingwu";
  region: string;
  sourceManifestSha256: string;
}

export interface MeetingRecoveryCommands {
  listRecoverableMeetingAnswerJobs(): Promise<RecoverableMeetingAnswer[]>;
  listRecoverableMeetingIntelligenceJobs(): Promise<RecoverableMeetingIntelligence[]>;
  listRecoverableMeetingPlaybackJobs(): Promise<RecoverableMeetingPlayback[]>;
  listRecoverableMeetingPurgeJobs(now?: Date): Promise<RecoverableMeetingPurge[]>;
  listRecoverableMeetingTranscriptionJobs(): Promise<RecoverableMeetingTranscription[]>;
  recoverMissingMeetingIntelligence(): Promise<void>;
}
