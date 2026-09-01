/* oxlint-disable anti-slop/no-unknown-parameters, class-methods-use-this, default-case, no-void, promise/prefer-await-to-callbacks, promise/prefer-await-to-then, typescript/parameter-properties -- Dynamic recovery intervals and tracked promise completion mirror the existing non-overlapping lease reconciliation lifecycle; rejected values are normalized before logging. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { SchedulerRegistry } from "@nestjs/schedule";
import {
  MEETING_ANSWER_QUEUE_NAME,
  reconcileMeetingAnswerJob,
} from "@arc/meeting-processing-queue/meeting-answer";
import type { MeetingAnswerJobData } from "@arc/meeting-processing-queue/meeting-answer";
import {
  MEETING_INTELLIGENCE_QUEUE_NAME,
  reconcileMeetingIntelligenceJob,
} from "@arc/meeting-processing-queue/meeting-intelligence";
import type { MeetingIntelligenceJobData } from "@arc/meeting-processing-queue/meeting-intelligence";
import {
  buildMeetingPlaybackJobId,
  MEETING_PLAYBACK_JOB_NAME,
  MEETING_PLAYBACK_QUEUE_NAME,
} from "@arc/meeting-processing-queue/meeting-playback";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import {
  MEETING_PURGE_QUEUE_NAME,
  reconcileMeetingPurgeJob,
} from "@arc/meeting-processing-queue/meeting-purge";
import type { MeetingPurgeJobData } from "@arc/meeting-processing-queue/meeting-purge";
import {
  MEETING_TRANSCRIPTION_QUEUE_NAME,
  reconcileMeetingTranscriptionJob,
} from "@arc/meeting-processing-queue/meeting-transcription";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import {
  buildResumeParseJobId,
  defaultResumeParseJobOptions,
  RESUME_PARSE_JOB_NAME,
  RESUME_PARSE_QUEUE_NAME,
  shouldRemoveExistingResumeParseJob,
} from "@arc/resume-parse-queue/resume-parse";
import type { ResumeParseJobData } from "@arc/resume-parse-queue/resume-parse";
import {
  buildResumeSemanticIndexJobId,
  RESUME_SEMANTIC_INDEX_JOB_NAME,
  RESUME_SEMANTIC_INDEX_QUEUE_NAME,
} from "@arc/resume-parse-queue/resume-semantic-index";
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import type { Queue } from "bullmq";
import { isResumeSemanticIndexEnabled, resolveRecoveryIntervalMs } from "./background.config.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "./background.types.js";
import type { BackgroundWorkloadAdapter } from "./background.types.js";

type MeetingRecoveryName =
  | "meeting-answer"
  | "meeting-intelligence"
  | "meeting-playback"
  | "meeting-purge"
  | "meeting-transcription";

interface RecoverySnapshotEntry {
  lastCompletedAt: string | null;
  lastErrorAt: string | null;
  lastRecoveredCount: number;
  running: boolean;
}

export type BackgroundRecoverySnapshot = Record<MeetingRecoveryName, RecoverySnapshotEntry>;

const MEETING_RECOVERY_NAMES: readonly MeetingRecoveryName[] = [
  "meeting-answer",
  "meeting-intelligence",
  "meeting-playback",
  "meeting-purge",
  "meeting-transcription",
];

function recoverySnapshotEntry(): RecoverySnapshotEntry {
  return {
    lastCompletedAt: null,
    lastErrorAt: null,
    lastRecoveredCount: 0,
    running: false,
  };
}

function emptySnapshot() {
  return {
    "meeting-answer": recoverySnapshotEntry(),
    "meeting-intelligence": recoverySnapshotEntry(),
    "meeting-playback": recoverySnapshotEntry(),
    "meeting-purge": recoverySnapshotEntry(),
    "meeting-transcription": recoverySnapshotEntry(),
  } satisfies BackgroundRecoverySnapshot;
}

@Injectable()
export class BackgroundRecoveryService {
  private readonly logger = new Logger(BackgroundRecoveryService.name);
  private readonly running = new Map<MeetingRecoveryName, Promise<void>>();
  private snapshot = emptySnapshot();

  constructor(
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @InjectQueue(RESUME_PARSE_QUEUE_NAME)
    private readonly resumeParseQueue: Queue<ResumeParseJobData>,
    @InjectQueue(RESUME_SEMANTIC_INDEX_QUEUE_NAME)
    private readonly resumeSemanticIndexQueue: Queue<ResumeSemanticIndexJobData>,
    @InjectQueue(MEETING_ANSWER_QUEUE_NAME)
    private readonly meetingAnswerQueue: Queue<MeetingAnswerJobData>,
    @InjectQueue(MEETING_PLAYBACK_QUEUE_NAME)
    private readonly meetingPlaybackQueue: Queue<MeetingPlaybackJobData>,
    @InjectQueue(MEETING_PURGE_QUEUE_NAME)
    private readonly meetingPurgeQueue: Queue<MeetingPurgeJobData>,
    @InjectQueue(MEETING_INTELLIGENCE_QUEUE_NAME)
    private readonly meetingIntelligenceQueue: Queue<MeetingIntelligenceJobData>,
    @InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME)
    private readonly meetingTranscriptionQueue: Queue<MeetingTranscriptionJobData>,
  ) {}

  async start(input: { transcription: boolean }): Promise<void> {
    await this.recoverResumeParse();
    if (isResumeSemanticIndexEnabled()) {
      await this.recoverResumeSemanticIndex();
    }
    for (const name of MEETING_RECOVERY_NAMES) {
      if (name === "meeting-transcription" && !input.transcription) {
        continue;
      }
      await this.runMeetingRecovery(name);
      const interval = setInterval(
        () => void this.runMeetingRecovery(name),
        resolveRecoveryIntervalMs(),
      );
      interval.unref();
      this.schedulerRegistry.addInterval(this.intervalName(name), interval);
    }
  }

  getSnapshot(): BackgroundRecoverySnapshot {
    return structuredClone(this.snapshot);
  }

  async close(): Promise<void> {
    for (const name of MEETING_RECOVERY_NAMES) {
      const intervalName = this.intervalName(name);
      if (this.schedulerRegistry.doesExist("interval", intervalName)) {
        this.schedulerRegistry.deleteInterval(intervalName);
      }
    }
    await Promise.allSettled(this.running.values());
  }

  private async recoverResumeParse(): Promise<void> {
    const jobs = await this.adapter.listRecoverableResumeParseJobs();
    await this.enqueueResumeParse(jobs);
    this.logger.log("Resume parse startup recovery completed", { count: jobs.length });
  }

  private async recoverResumeSemanticIndex(): Promise<void> {
    const jobs = await this.adapter.listRecoverableResumeSemanticIndexJobs();
    await this.enqueueResumeSemanticIndex(jobs);
    this.logger.log("Resume semantic index startup recovery completed", { count: jobs.length });
  }

  private runMeetingRecovery(name: MeetingRecoveryName): Promise<void> {
    const active = this.running.get(name);
    if (active) {
      return active;
    }
    this.snapshot = {
      ...this.snapshot,
      [name]: { ...this.snapshot[name], running: true },
    };
    const recovery = this.executeMeetingRecovery(name)
      .then((count) => {
        this.snapshot = {
          ...this.snapshot,
          [name]: {
            ...this.snapshot[name],
            lastCompletedAt: new Date().toISOString(),
            lastRecoveredCount: count,
          },
        };
        this.logger.log("Meeting workload recovery completed", { count, workload: name });
      })
      .catch((error: unknown) => {
        this.snapshot = {
          ...this.snapshot,
          [name]: { ...this.snapshot[name], lastErrorAt: new Date().toISOString() },
        };
        this.logger.error("Meeting workload recovery failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          workload: name,
        });
      })
      .finally(() => {
        this.running.delete(name);
        this.snapshot = {
          ...this.snapshot,
          [name]: { ...this.snapshot[name], running: false },
        };
      });
    this.running.set(name, recovery);
    return recovery;
  }

  private async executeMeetingRecovery(name: MeetingRecoveryName): Promise<number> {
    switch (name) {
      case "meeting-answer": {
        const jobs = await this.adapter.listRecoverableMeetingAnswerJobs();
        await Promise.all(
          jobs.map((job) => reconcileMeetingAnswerJob(this.meetingAnswerQueue, job)),
        );
        return jobs.length;
      }
      case "meeting-intelligence": {
        await this.adapter.recoverMissingMeetingIntelligence();
        const jobs = await this.adapter.listRecoverableMeetingIntelligenceJobs();
        await Promise.all(
          jobs.map((job) => reconcileMeetingIntelligenceJob(this.meetingIntelligenceQueue, job)),
        );
        return jobs.length;
      }
      case "meeting-playback": {
        const jobs = await this.adapter.listRecoverableMeetingPlaybackJobs();
        await this.enqueueMeetingPlayback(jobs);
        return jobs.length;
      }
      case "meeting-purge": {
        const jobs = await this.adapter.listRecoverableMeetingPurgeJobs();
        await Promise.all(jobs.map((job) => reconcileMeetingPurgeJob(this.meetingPurgeQueue, job)));
        return jobs.length;
      }
      case "meeting-transcription": {
        const jobs = await this.adapter.listRecoverableMeetingTranscriptionJobs();
        await Promise.all(
          jobs.map((job) => reconcileMeetingTranscriptionJob(this.meetingTranscriptionQueue, job)),
        );
        return jobs.length;
      }
    }
  }

  private async enqueueResumeParse(jobs: ResumeParseJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    const options = defaultResumeParseJobOptions();
    await this.removeFinishedJobs(
      this.resumeParseQueue,
      jobs.map((job) => buildResumeParseJobId(job.itemId)),
    );
    await this.resumeParseQueue.addBulk(
      jobs.map((data) => ({
        data,
        name: RESUME_PARSE_JOB_NAME,
        opts: { ...options, jobId: buildResumeParseJobId(data.itemId) },
      })),
    );
  }

  private async enqueueResumeSemanticIndex(jobs: ResumeSemanticIndexJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await this.removeFinishedJobs(
      this.resumeSemanticIndexQueue,
      jobs.map((job) => buildResumeSemanticIndexJobId(job)),
    );
    await this.resumeSemanticIndexQueue.addBulk(
      jobs.map((data) => ({
        data,
        name: RESUME_SEMANTIC_INDEX_JOB_NAME,
        opts: {
          ...defaultResumeParseJobOptions(),
          jobId: buildResumeSemanticIndexJobId(data),
          removeOnComplete: { count: 2000 },
          removeOnFail: { count: 5000 },
        },
      })),
    );
  }

  private async enqueueMeetingPlayback(jobs: MeetingPlaybackJobData[]): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await this.removeFinishedJobs(
      this.meetingPlaybackQueue,
      jobs.map((job) => buildMeetingPlaybackJobId(job)),
    );
    await this.meetingPlaybackQueue.addBulk(
      jobs.map((data) => ({
        data,
        name: MEETING_PLAYBACK_JOB_NAME,
        opts: {
          attempts: 5,
          backoff: { delay: 5000, type: "exponential" },
          jobId: buildMeetingPlaybackJobId(data),
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      })),
    );
  }

  private async removeFinishedJobs<T>(queue: Queue<T>, jobIds: string[]): Promise<void> {
    await Promise.all(
      jobIds.map(async (id) => {
        const existing = await queue.getJob(id);
        if (!existing) {
          return;
        }
        if (shouldRemoveExistingResumeParseJob(await existing.getState())) {
          await existing.remove();
        }
      }),
    );
  }

  private intervalName(name: MeetingRecoveryName): string {
    return `background:recovery:${name}`;
  }
}
