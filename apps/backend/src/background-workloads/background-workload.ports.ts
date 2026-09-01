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
import type {
  BackgroundAttemptContext,
  BackgroundJobFailure,
  InterviewNotificationBatchInput,
  MailIngestConfig,
  MailIngestRunResult,
  MailIngestRunScope,
  MeetingOperationsSnapshot,
} from "../background/background.types.js";

/** Injection token for the infrastructure/application functions used by the migrated workloads. */
export const BACKGROUND_WORKLOAD_PORTS = Symbol("BACKGROUND_WORKLOAD_PORTS");

/**
 * Narrow, workload-owned ports. Implementations live in the new backend's
 * feature/infrastructure modules; the adapter never reaches back into either
 * legacy application. Grouping the functions makes missing capabilities fail
 * at startup and prevents a queue handler from silently becoming a no-op.
 */
export interface BackgroundWorkloadPorts {
  configuration: {
    assertConfigured(): void;
  };
  dependencies: {
    ping(): Promise<void>;
  };
  interviewNotifications: {
    processBatch(input: InterviewNotificationBatchInput): Promise<number>;
  };
  mailIngest: {
    run(config: MailIngestConfig, scope?: MailIngestRunScope): Promise<MailIngestRunResult>;
  };
  meetingAnswer: {
    listRecoverable(): Promise<MeetingAnswerJobData[]>;
    process(data: MeetingAnswerJobData, context: BackgroundAttemptContext): Promise<void>;
  };
  meetingIntelligence: {
    listRecoverable(): Promise<MeetingIntelligenceJobData[]>;
    process(data: MeetingIntelligenceJobData, context: BackgroundAttemptContext): Promise<void>;
    recoverMissing(): Promise<void>;
  };
  meetingOperations: {
    loadSnapshot(): Promise<MeetingOperationsSnapshot>;
  };
  meetingPlayback: {
    listRecoverable(): Promise<MeetingPlaybackJobData[]>;
    process(data: MeetingPlaybackJobData): Promise<void>;
  };
  meetingPurge: {
    listRecoverable(): Promise<MeetingPurgeJobData[]>;
    process(data: MeetingPurgeJobData): Promise<void>;
  };
  meetingTranscription: {
    listRecoverable(): Promise<MeetingTranscriptionJobData[]>;
    prepare(): Promise<boolean>;
    process(data: MeetingTranscriptionJobData, context: BackgroundAttemptContext): Promise<void>;
  };
  observability: {
    reportJobFailure(failure: BackgroundJobFailure): void;
  };
  resumeParse: {
    listRecoverable(): Promise<ResumeParseJobData[]>;
    process(data: ResumeParseJobData, context: ResumeParseJobContext): Promise<void>;
  };
  resumeReviewGeneration: {
    process(
      data: ResumeReviewGenerationJobData,
      context: ResumeReviewGenerationJobContext,
    ): Promise<void>;
  };
  resumeSemanticIndex: {
    listRecoverable(): Promise<ResumeSemanticIndexJobData[]>;
    process(data: ResumeSemanticIndexJobData): Promise<void>;
  };
}
