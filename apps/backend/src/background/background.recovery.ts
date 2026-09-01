/* oxlint-disable anti-slop/no-unknown-parameters, class-methods-use-this, default-case, no-void, promise/prefer-await-to-callbacks, promise/prefer-await-to-then, typescript/parameter-properties -- Dynamic recovery intervals and tracked promise completion mirror the existing non-overlapping lease reconciliation lifecycle; rejected values are normalized before logging. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { BackendConfigService } from "../config/backend-config.service.js";
import { BackgroundQueueProducerService } from "./background-queue-producer.service.js";
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
  private readonly intervalMs: number;
  private readonly resumeSemanticIndexEnabled: boolean;
  private readonly running = new Map<MeetingRecoveryName, Promise<void>>();
  private snapshot = emptySnapshot();

  constructor(
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
    @Inject(BackendConfigService) config: BackendConfigService,
  ) {
    this.intervalMs = config.get("BACKGROUND_RECOVERY_INTERVAL_MS") ?? 60_000;
    this.resumeSemanticIndexEnabled = config.get("RESUME_SEMANTIC_INDEX_ENABLED");
  }

  async start(input: { transcription: boolean }): Promise<void> {
    await this.recoverResumeParse();
    if (this.resumeSemanticIndexEnabled) {
      await this.recoverResumeSemanticIndex();
    }
    for (const name of MEETING_RECOVERY_NAMES) {
      if (name === "meeting-transcription" && !input.transcription) {
        continue;
      }
      await this.runMeetingRecovery(name);
      const interval = setInterval(() => void this.runMeetingRecovery(name), this.intervalMs);
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
    await this.queueProducer.enqueueResumeParseJobs(jobs);
    this.logger.log("Resume parse startup recovery completed", { count: jobs.length });
  }

  private async recoverResumeSemanticIndex(): Promise<void> {
    const jobs = await this.adapter.listRecoverableResumeSemanticIndexJobs();
    await this.queueProducer.enqueueResumeSemanticIndexJobs(jobs);
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
        await this.queueProducer.enqueueMeetingAnswerJobs(jobs);
        return jobs.length;
      }
      case "meeting-intelligence": {
        await this.adapter.recoverMissingMeetingIntelligence();
        const jobs = await this.adapter.listRecoverableMeetingIntelligenceJobs();
        await this.queueProducer.enqueueMeetingIntelligenceJobs(jobs);
        return jobs.length;
      }
      case "meeting-playback": {
        const jobs = await this.adapter.listRecoverableMeetingPlaybackJobs();
        await this.queueProducer.enqueueMeetingPlaybackJobs(jobs);
        return jobs.length;
      }
      case "meeting-purge": {
        const jobs = await this.adapter.listRecoverableMeetingPurgeJobs();
        await this.queueProducer.enqueueMeetingPurgeJobs(jobs);
        return jobs.length;
      }
      case "meeting-transcription": {
        const jobs = await this.adapter.listRecoverableMeetingTranscriptionJobs();
        await this.queueProducer.enqueueMeetingTranscriptionJobs(jobs);
        return jobs.length;
      }
    }
  }

  private intervalName(name: MeetingRecoveryName): string {
    return `background:recovery:${name}`;
  }
}
