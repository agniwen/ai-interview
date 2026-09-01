/* oxlint-disable typescript/consistent-type-imports, typescript/parameter-properties -- Nest lifecycle and BullRegistrar tokens require runtime constructor metadata. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { BullRegistrar, InjectQueue } from "@nestjs/bullmq";
import { MEETING_ANSWER_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-answer";
import { MEETING_INTELLIGENCE_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-intelligence";
import { MEETING_PLAYBACK_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-playback";
import { MEETING_PURGE_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-purge";
import { MEETING_TRANSCRIPTION_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-transcription";
import { MAIL_INGEST_TRIGGER_QUEUE_NAME } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { RESUME_REVIEW_GENERATION_QUEUE_NAME } from "@arc/resume-parse-queue/resume-review-generation";
import { RESUME_SEMANTIC_INDEX_QUEUE_NAME } from "@arc/resume-parse-queue/resume-semantic-index";
import type { Queue } from "bullmq";
import {
  assertBackgroundRedisConfigured,
  isBackgroundWorkersEnabled,
  isResumeSemanticIndexEnabled,
} from "./background.config.js";
import { BackgroundDiagnosticsService } from "./background.diagnostics.js";
import { BackgroundProcessorRegistry } from "./background.processors.js";
import { BackgroundRecoveryService } from "./background.recovery.js";
import {
  InterviewNotificationSchedulerService,
  MailIngestSchedulerService,
} from "./background.schedulers.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundLifecycleSnapshot, BackgroundWorkloadAdapter } from "./background.types.js";

export const BACKGROUND_LIFECYCLE = Symbol("BACKGROUND_LIFECYCLE");

export interface BackgroundLifecycle {
  close(): Promise<void>;
  getSnapshot(): BackgroundLifecycleSnapshot;
  start(): Promise<void>;
}

@Injectable()
export class BackgroundLifecycleService
  implements BackgroundLifecycle, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly enabled = isBackgroundWorkersEnabled();
  private readonly logger = new Logger(BackgroundLifecycleService.name);
  private closePromise: Promise<void> | null = null;
  private snapshot: BackgroundLifecycleSnapshot = {
    draining: false,
    enabled: this.enabled,
    lastStartupError: null,
    ready: false,
    registered: false,
    startedAt: null,
    transcriptionEnabled: false,
  };

  constructor(
    private readonly bullRegistrar: BullRegistrar,
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    private readonly processors: BackgroundProcessorRegistry,
    private readonly recovery: BackgroundRecoveryService,
    private readonly mailIngest: MailIngestSchedulerService,
    private readonly notifications: InterviewNotificationSchedulerService,
    diagnostics: BackgroundDiagnosticsService,
    @InjectQueue(RESUME_PARSE_QUEUE_NAME) private readonly resumeParseQueue: Queue,
    @InjectQueue(RESUME_SEMANTIC_INDEX_QUEUE_NAME)
    private readonly resumeSemanticIndexQueue: Queue,
    @InjectQueue(RESUME_REVIEW_GENERATION_QUEUE_NAME)
    private readonly resumeReviewGenerationQueue: Queue,
    @InjectQueue(MAIL_INGEST_TRIGGER_QUEUE_NAME) private readonly mailIngestTriggerQueue: Queue,
    @InjectQueue(MEETING_ANSWER_QUEUE_NAME) private readonly meetingAnswerQueue: Queue,
    @InjectQueue(MEETING_PLAYBACK_QUEUE_NAME) private readonly meetingPlaybackQueue: Queue,
    @InjectQueue(MEETING_PURGE_QUEUE_NAME) private readonly meetingPurgeQueue: Queue,
    @InjectQueue(MEETING_INTELLIGENCE_QUEUE_NAME)
    private readonly meetingIntelligenceQueue: Queue,
    @InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME)
    private readonly meetingTranscriptionQueue: Queue,
  ) {
    diagnostics.bindLifecycle(this);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  async start(): Promise<void> {
    if (this.snapshot.ready) {
      return;
    }
    if (!this.enabled) {
      this.logger.log("Background workloads are disabled for this replica");
      return;
    }
    try {
      assertBackgroundRedisConfigured();
      this.adapter.assertConfigured();
      this.bullRegistrar.register();
      this.snapshot = { ...this.snapshot, registered: true };
      const transcriptionEnabled = await this.adapter.prepareMeetingTranscription();
      await this.recovery.start({ transcription: transcriptionEnabled });
      this.mailIngest.start();
      this.notifications.start();
      this.processors.start({
        mailIngest: this.mailIngest.enabled,
        resumeSemanticIndex: isResumeSemanticIndexEnabled(),
        transcription: transcriptionEnabled,
      });
      this.snapshot = {
        ...this.snapshot,
        ready: true,
        startedAt: new Date().toISOString(),
        transcriptionEnabled,
      };
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        lastStartupError: error instanceof Error ? error.name : "UnknownError",
        ready: false,
      };
      await this.close();
      throw error;
    }
  }

  getSnapshot(): BackgroundLifecycleSnapshot {
    return { ...this.snapshot };
  }

  async close(): Promise<void> {
    this.closePromise ??= this.closeOnce();
    await this.closePromise;
  }

  private async closeOnce(): Promise<void> {
    this.snapshot = { ...this.snapshot, draining: true, ready: false };
    await Promise.allSettled([
      this.mailIngest.close(),
      this.notifications.close(),
      this.recovery.close(),
    ]);
    if (this.snapshot.registered) {
      await this.processors.close();
      await Promise.allSettled(this.queues().map((queue) => queue.close()));
    }
    this.snapshot = { ...this.snapshot, draining: false, registered: false };
  }

  private queues(): Queue[] {
    return [
      this.resumeParseQueue,
      this.resumeSemanticIndexQueue,
      this.resumeReviewGenerationQueue,
      this.mailIngestTriggerQueue,
      this.meetingAnswerQueue,
      this.meetingPlaybackQueue,
      this.meetingPurgeQueue,
      this.meetingIntelligenceQueue,
      this.meetingTranscriptionQueue,
    ];
  }
}
