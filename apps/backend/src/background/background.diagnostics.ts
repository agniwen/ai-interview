/* oxlint-disable class-methods-use-this -- Nest constructor injection and pure queue mappers are intentional module boundaries. */
import { Inject, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { MEETING_ANSWER_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_INTELLIGENCE_QUEUE_NAME,
  resolveMeetingIntelligenceWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  MEETING_PLAYBACK_QUEUE_NAME,
  resolveMeetingPlaybackWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-playback";
import { MEETING_PURGE_QUEUE_NAME } from "@arc/meeting-processing-queue/meeting-purge";
import {
  MEETING_TRANSCRIPTION_QUEUE_NAME,
  resolveMeetingTranscriptionWorkerConcurrency,
} from "@arc/meeting-processing-queue/meeting-transcription";
import { RESUME_PARSE_QUEUE_NAME } from "@arc/resume-parse-queue/resume-parse";
import { MAIL_INGEST_TRIGGER_QUEUE_NAME } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { RESUME_REVIEW_GENERATION_QUEUE_NAME } from "@arc/resume-parse-queue/resume-review-generation";
import { RESUME_SEMANTIC_INDEX_QUEUE_NAME } from "@arc/resume-parse-queue/resume-semantic-index";
import type { Queue } from "bullmq";
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { BackgroundRecoveryService } from "./background.recovery.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type {
  BackgroundLifecycleSnapshot,
  BackgroundQueueCounts,
  BackgroundQueueStats,
  BackgroundWorkloadAdapter,
  InterviewNotificationSchedulerSnapshot,
  MeetingOperationsSnapshot,
} from "./background.types.js";
import { InterviewNotificationSchedulerService } from "../domains/candidate-lifecycle/workloads/schedulers/candidate.schedulers.js";

const COUNT_TYPES = [
  "waiting",
  "active",
  "delayed",
  "failed",
  "completed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;

export interface BackgroundLifecycleSnapshotSource {
  getSnapshot(): BackgroundLifecycleSnapshot;
}

@Injectable()
export class BackgroundDiagnosticsService {
  private lifecycleSource: BackgroundLifecycleSnapshotSource | null = null;

  constructor(
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @Inject(InterviewNotificationSchedulerService)
    private readonly notificationScheduler: InterviewNotificationSchedulerService,
    @Inject(BackgroundRecoveryService)
    private readonly recovery: BackgroundRecoveryService,
    @InjectQueue(RESUME_PARSE_QUEUE_NAME)
    private readonly resumeParseQueue: Queue,
    @InjectQueue(RESUME_SEMANTIC_INDEX_QUEUE_NAME)
    private readonly resumeSemanticIndexQueue: Queue,
    @InjectQueue(RESUME_REVIEW_GENERATION_QUEUE_NAME)
    private readonly resumeReviewGenerationQueue: Queue,
    @InjectQueue(MAIL_INGEST_TRIGGER_QUEUE_NAME)
    private readonly mailIngestTriggerQueue: Queue,
    @InjectQueue(MEETING_ANSWER_QUEUE_NAME)
    private readonly meetingAnswerQueue: Queue,
    @InjectQueue(MEETING_PLAYBACK_QUEUE_NAME)
    private readonly meetingPlaybackQueue: Queue,
    @InjectQueue(MEETING_PURGE_QUEUE_NAME)
    private readonly meetingPurgeQueue: Queue,
    @InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME)
    private readonly meetingTranscriptionQueue: Queue,
    @InjectQueue(MEETING_INTELLIGENCE_QUEUE_NAME)
    private readonly meetingIntelligenceQueue: Queue,
  ) {}

  bindLifecycle(source: BackgroundLifecycleSnapshotSource): void {
    this.lifecycleSource = source;
  }

  getLifecycleSnapshot(): BackgroundLifecycleSnapshot {
    if (!this.lifecycleSource) {
      return {
        draining: false,
        enabled: false,
        lastStartupError: null,
        ready: false,
        registered: false,
        startedAt: null,
        transcriptionEnabled: false,
      };
    }
    return this.lifecycleSource.getSnapshot();
  }

  getInterviewNotificationSnapshot(): InterviewNotificationSchedulerSnapshot {
    return this.notificationScheduler.getSnapshot();
  }

  getRecoverySnapshot() {
    return this.recovery.getSnapshot();
  }

  async getResumeParseQueueStats(): Promise<BackgroundQueueCounts> {
    return await this.queueCounts(this.resumeParseQueue);
  }

  async getResumeReviewGenerationQueueStats(): Promise<BackgroundQueueCounts> {
    return await this.queueCounts(this.resumeReviewGenerationQueue);
  }

  async getMeetingOperationsSnapshot(): Promise<
    MeetingOperationsSnapshot & {
      queues: {
        finalTranscription: BackgroundQueueStats;
        intelligence: BackgroundQueueStats;
        mediaFinalization: BackgroundQueueStats;
      };
    }
  > {
    const [database, queues] = await Promise.all([
      this.adapter.loadMeetingOperationsSnapshot(),
      this.getMeetingQueueStats(),
    ]);
    return { ...database, queues };
  }

  async getReadinessIssue(): Promise<string | null> {
    const lifecycle = this.getLifecycleSnapshot();
    if (!lifecycle.enabled) {
      return "Background workers are disabled";
    }
    if (!lifecycle.ready || lifecycle.draining) {
      return "Background workers are not ready";
    }
    try {
      this.adapter.assertConfigured();
    } catch {
      return "Feature configuration is incomplete";
    }
    try {
      await Promise.all([
        this.adapter.pingDependencies(),
        this.resumeParseQueue.getJobCounts("waiting"),
        ...this.queues().map((queue) => queue.waitUntilReady()),
      ]);
      return null;
    } catch {
      return "Dependency check failed";
    }
  }

  async getMeetingQueueStats(): Promise<{
    finalTranscription: BackgroundQueueStats;
    intelligence: BackgroundQueueStats;
    mediaFinalization: BackgroundQueueStats;
  }> {
    const [mediaFinalization, finalTranscription, intelligence] = await Promise.all([
      this.queueStats(
        this.meetingPlaybackQueue,
        resolveMeetingPlaybackWorkerConcurrency(rawBackendEnvironment),
      ),
      this.queueStats(
        this.meetingTranscriptionQueue,
        resolveMeetingTranscriptionWorkerConcurrency(rawBackendEnvironment),
      ),
      this.queueStats(
        this.meetingIntelligenceQueue,
        resolveMeetingIntelligenceWorkerConcurrency(rawBackendEnvironment),
      ),
    ]);
    return { finalTranscription, intelligence, mediaFinalization };
  }

  private async queueStats(
    queue: Queue,
    concurrency: number,
    detailed = false,
  ): Promise<BackgroundQueueStats> {
    const types = detailed ? COUNT_TYPES : COUNT_TYPES.slice(0, 4);
    const counts = await queue.getJobCounts(...types);
    const result: BackgroundQueueStats = {
      active: counts.active ?? 0,
      concurrency,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      waiting: counts.waiting ?? 0,
    };
    if (detailed) {
      result.completed = counts.completed ?? 0;
      result.paused = counts.paused ?? 0;
      result.prioritized = counts.prioritized ?? 0;
      result.waitingChildren = counts["waiting-children"] ?? 0;
    }
    return result;
  }

  private async queueCounts(queue: Queue): Promise<BackgroundQueueCounts> {
    const counts = await queue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
      "paused",
    );
    return {
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      paused: counts.paused ?? 0,
      waiting: counts.waiting ?? 0,
    };
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
