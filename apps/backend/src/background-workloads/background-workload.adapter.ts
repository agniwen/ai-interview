/* oxlint-disable anti-slop/no-object-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Startup validates an injected object graph before any worker is registered; values cannot have a narrower type until each manifest path has been resolved. */
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
  BackgroundWorkloadAdapter,
  InterviewNotificationBatchInput,
  MailIngestConfig,
  MailIngestRunResult,
  MailIngestRunScope,
  MeetingOperationsSnapshot,
} from "../background/background.types.js";
import { BACKGROUND_WORKLOAD_REQUIRED_PORTS } from "./background-workload.manifest.js";
import type { BackgroundWorkloadPorts } from "./background-workload.ports.js";

function resolvePath(root: object, path: string): unknown {
  let value: unknown = root;
  for (const segment of path.split(".")) {
    if (!(value && typeof value === "object" && segment in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

/**
 * Real application adapter for every Nest queue/scheduler workload. It is
 * deliberately boring: transaction, provider, storage and AI behavior belongs
 * to the narrowly injected port, while this class is the stable seam consumed
 * by BackgroundModule.
 */
export class MigratedBackgroundWorkloadAdapter implements BackgroundWorkloadAdapter {
  private readonly ports: BackgroundWorkloadPorts;

  constructor(ports: BackgroundWorkloadPorts) {
    this.ports = ports;
  }

  assertConfigured(): void {
    const missing = BACKGROUND_WORKLOAD_REQUIRED_PORTS.filter(
      (path) => typeof resolvePath(this.ports, path) !== "function",
    );
    if (missing.length > 0) {
      throw new Error(`Background workloads are not wired: ${missing.join(", ")}`);
    }
    this.ports.configuration.assertConfigured();
  }

  listRecoverableMeetingAnswerJobs(): Promise<MeetingAnswerJobData[]> {
    return this.ports.meetingAnswer.listRecoverable();
  }

  listRecoverableMeetingIntelligenceJobs(): Promise<MeetingIntelligenceJobData[]> {
    return this.ports.meetingIntelligence.listRecoverable();
  }

  listRecoverableMeetingPlaybackJobs(): Promise<MeetingPlaybackJobData[]> {
    return this.ports.meetingPlayback.listRecoverable();
  }

  listRecoverableMeetingPurgeJobs(): Promise<MeetingPurgeJobData[]> {
    return this.ports.meetingPurge.listRecoverable();
  }

  listRecoverableMeetingTranscriptionJobs(): Promise<MeetingTranscriptionJobData[]> {
    return this.ports.meetingTranscription.listRecoverable();
  }

  listRecoverableResumeParseJobs(): Promise<ResumeParseJobData[]> {
    return this.ports.resumeParse.listRecoverable();
  }

  listRecoverableResumeSemanticIndexJobs(): Promise<ResumeSemanticIndexJobData[]> {
    return this.ports.resumeSemanticIndex.listRecoverable();
  }

  loadMeetingOperationsSnapshot(): Promise<MeetingOperationsSnapshot> {
    return this.ports.meetingOperations.loadSnapshot();
  }

  pingDependencies(): Promise<void> {
    return this.ports.dependencies.ping();
  }

  prepareMeetingTranscription(): Promise<boolean> {
    return this.ports.meetingTranscription.prepare();
  }

  processInterviewNotificationBatch(input: InterviewNotificationBatchInput): Promise<number> {
    return this.ports.interviewNotifications.processBatch(input);
  }

  processMeetingAnswer(
    data: MeetingAnswerJobData,
    context: BackgroundAttemptContext,
  ): Promise<void> {
    return this.ports.meetingAnswer.process(data, context);
  }

  processMeetingIntelligence(
    data: MeetingIntelligenceJobData,
    context: BackgroundAttemptContext,
  ): Promise<void> {
    return this.ports.meetingIntelligence.process(data, context);
  }

  processMeetingPlayback(data: MeetingPlaybackJobData): Promise<void> {
    return this.ports.meetingPlayback.process(data);
  }

  processMeetingPurge(data: MeetingPurgeJobData): Promise<void> {
    return this.ports.meetingPurge.process(data);
  }

  processMeetingTranscription(
    data: MeetingTranscriptionJobData,
    context: BackgroundAttemptContext,
  ): Promise<void> {
    return this.ports.meetingTranscription.process(data, context);
  }

  processResumeParse(data: ResumeParseJobData, context: ResumeParseJobContext): Promise<void> {
    return this.ports.resumeParse.process(data, context);
  }

  processResumeReviewGeneration(
    data: ResumeReviewGenerationJobData,
    context: ResumeReviewGenerationJobContext,
  ): Promise<void> {
    return this.ports.resumeReviewGeneration.process(data, context);
  }

  processResumeSemanticIndex(data: ResumeSemanticIndexJobData): Promise<void> {
    return this.ports.resumeSemanticIndex.process(data);
  }

  recoverMissingMeetingIntelligence(): Promise<void> {
    return this.ports.meetingIntelligence.recoverMissing();
  }

  reportJobFailure(failure: BackgroundJobFailure): void {
    this.ports.observability.reportJobFailure(failure);
  }

  runMailIngest(
    config: MailIngestConfig,
    scope?: MailIngestRunScope,
  ): Promise<MailIngestRunResult> {
    return this.ports.mailIngest.run(config, scope);
  }
}

export function createBackgroundWorkloadAdapter(
  ports: BackgroundWorkloadPorts,
): BackgroundWorkloadAdapter {
  return new MigratedBackgroundWorkloadAdapter(ports);
}
