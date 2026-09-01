import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import type {
  ResumeParseJobContext,
  ResumeParseJobData,
} from "@arc/resume-parse-queue/resume-parse";
import type {
  ResumeReviewGenerationJobContext,
  ResumeReviewGenerationJobData,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import type { FactoryProvider, ModuleMetadata } from "@nestjs/common";

export const BACKGROUND_WORKLOAD_ADAPTER = Symbol("BACKGROUND_WORKLOAD_ADAPTER");

export interface BackgroundAttemptContext {
  attempt: number;
  maxAttempts: number;
}

export interface MailIngestConfig {
  intervalMs: number;
  maxAccountsPerRun: number;
  maxMessagesPerAccount: number;
}

export interface MailIngestRunScope {
  organizationId: string;
}

export interface MailIngestRunResult {
  accounts: number;
  messagesFailed: number;
  messagesQueued: number;
  messagesSkipped: number;
}

export interface InterviewNotificationBatchInput {
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  now: Date;
}

export interface BackgroundJobFailure {
  attemptsMade: number;
  error: Error;
  jobId: string | undefined;
  queue: string;
}

export interface MeetingOperationsSnapshot {
  alerts: unknown[];
  capacity: unknown;
  generatedAt: string;
  latency: unknown;
  providerFailures: unknown[];
  purgeOutcomes: unknown[];
  queueRetries: unknown[];
}

/**
 * Application-facing port for every business operation formerly imported by
 * apps/worker. The Nest background layer owns queue and scheduling mechanics;
 * migrated domain modules own database, storage, provider, and mail behavior.
 */
export interface BackgroundWorkloadAdapter {
  assertConfigured(): void;
  listRecoverableMeetingAnswerJobs(): Promise<MeetingAnswerJobData[]>;
  listRecoverableMeetingIntelligenceJobs(): Promise<MeetingIntelligenceJobData[]>;
  listRecoverableMeetingPlaybackJobs(): Promise<MeetingPlaybackJobData[]>;
  listRecoverableMeetingPurgeJobs(): Promise<MeetingPurgeJobData[]>;
  listRecoverableMeetingTranscriptionJobs(): Promise<MeetingTranscriptionJobData[]>;
  listRecoverableResumeParseJobs(): Promise<ResumeParseJobData[]>;
  listRecoverableResumeSemanticIndexJobs(): Promise<ResumeSemanticIndexJobData[]>;
  loadMeetingOperationsSnapshot(): Promise<MeetingOperationsSnapshot>;
  pingDependencies(): Promise<void>;
  prepareMeetingTranscription(): Promise<boolean>;
  processInterviewNotificationBatch(input: InterviewNotificationBatchInput): Promise<number>;
  processMeetingAnswer(
    data: MeetingAnswerJobData,
    context: BackgroundAttemptContext,
  ): Promise<void>;
  processMeetingIntelligence(
    data: MeetingIntelligenceJobData,
    context: BackgroundAttemptContext,
  ): Promise<void>;
  processMeetingPlayback(data: MeetingPlaybackJobData): Promise<void>;
  processMeetingPurge(data: MeetingPurgeJobData): Promise<void>;
  processMeetingTranscription(
    data: MeetingTranscriptionJobData,
    context: BackgroundAttemptContext,
  ): Promise<void>;
  processResumeParse(data: ResumeParseJobData, context: ResumeParseJobContext): Promise<void>;
  processResumeReviewGeneration(
    data: ResumeReviewGenerationJobData,
    context: ResumeReviewGenerationJobContext,
  ): Promise<void>;
  processResumeSemanticIndex(data: ResumeSemanticIndexJobData): Promise<void>;
  recoverMissingMeetingIntelligence(): Promise<void>;
  reportJobFailure?(failure: BackgroundJobFailure): void;
  runMailIngest(config: MailIngestConfig, scope?: MailIngestRunScope): Promise<MailIngestRunResult>;
}

export interface BackgroundModuleOptions {
  adapter: BackgroundWorkloadAdapter;
}

export interface BackgroundModuleAsyncOptions {
  imports?: ModuleMetadata["imports"];
  inject?: FactoryProvider["inject"];
  useFactory: FactoryProvider<
    BackgroundWorkloadAdapter | Promise<BackgroundWorkloadAdapter>
  >["useFactory"];
}

export interface BackgroundQueueStats {
  active: number;
  completed?: number;
  concurrency: number;
  delayed: number;
  failed: number;
  paused?: number;
  prioritized?: number;
  waiting: number;
  waitingChildren?: number;
}

export interface BackgroundQueueCounts {
  active: number;
  completed: number;
  delayed: number;
  failed: number;
  paused: number;
  waiting: number;
}

export interface InterviewNotificationSchedulerSnapshot {
  claimed: number;
  enabled: boolean;
  lastErrorAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  running: boolean;
}

export interface BackgroundLifecycleSnapshot {
  draining: boolean;
  enabled: boolean;
  lastStartupError: string | null;
  ready: boolean;
  registered: boolean;
  startedAt: string | null;
  transcriptionEnabled: boolean;
}
