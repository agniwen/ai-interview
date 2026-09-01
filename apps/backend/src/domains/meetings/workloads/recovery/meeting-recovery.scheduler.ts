/* oxlint-disable default-case, no-void -- Recovery intervals deliberately share one non-overlapping owner-local state machine. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import { BackendConfigService } from "../../../../config/backend-config.service.js";
import { MEETING_RECOVERY_COMMANDS } from "./meeting-recovery.commands.js";
import type { MeetingRecoveryCommands } from "./meeting-recovery.commands.js";

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

export type MeetingRecoverySnapshot = Record<MeetingRecoveryName, RecoverySnapshotEntry>;

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
  } satisfies MeetingRecoverySnapshot;
}

function intervalName(name: MeetingRecoveryName): string {
  return `background:recovery:${name}`;
}

@Injectable()
export class MeetingRecoveryScheduler {
  private readonly logger = new Logger(MeetingRecoveryScheduler.name);
  private readonly intervalMs: number;
  private readonly running = new Map<MeetingRecoveryName, Promise<void>>();
  private snapshot = emptySnapshot();

  constructor(
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(MEETING_RECOVERY_COMMANDS)
    private readonly recovery: MeetingRecoveryCommands,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
    @Inject(BackendConfigService) config: BackendConfigService,
  ) {
    this.intervalMs = config.get("BACKGROUND_RECOVERY_INTERVAL_MS") ?? 60_000;
  }

  async start(input: { transcription: boolean }): Promise<void> {
    for (const name of MEETING_RECOVERY_NAMES) {
      if (name === "meeting-transcription" && !input.transcription) {
        continue;
      }
      await this.runRecovery(name);
      const interval = setInterval(() => void this.runRecovery(name), this.intervalMs);
      interval.unref();
      this.schedulerRegistry.addInterval(intervalName(name), interval);
    }
  }

  getSnapshot(): MeetingRecoverySnapshot {
    return structuredClone(this.snapshot);
  }

  async close(): Promise<void> {
    for (const name of MEETING_RECOVERY_NAMES) {
      const nameForInterval = intervalName(name);
      if (this.schedulerRegistry.doesExist("interval", nameForInterval)) {
        this.schedulerRegistry.deleteInterval(nameForInterval);
      }
    }
    await Promise.allSettled(this.running.values());
  }

  private runRecovery(name: MeetingRecoveryName): Promise<void> {
    const active = this.running.get(name);
    if (active) {
      return active;
    }
    this.snapshot = {
      ...this.snapshot,
      [name]: { ...this.snapshot[name], running: true },
    };
    const pending = this.performRecovery(name);
    this.running.set(name, pending);
    return pending;
  }

  private async performRecovery(name: MeetingRecoveryName): Promise<void> {
    try {
      const count = await this.executeRecovery(name);
      this.snapshot = {
        ...this.snapshot,
        [name]: {
          ...this.snapshot[name],
          lastCompletedAt: new Date().toISOString(),
          lastRecoveredCount: count,
        },
      };
      this.logger.log("Meeting workload recovery completed", { count, workload: name });
    } catch (error) {
      this.snapshot = {
        ...this.snapshot,
        [name]: { ...this.snapshot[name], lastErrorAt: new Date().toISOString() },
      };
      this.logger.error("Meeting workload recovery failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        workload: name,
      });
    } finally {
      this.running.delete(name);
      this.snapshot = {
        ...this.snapshot,
        [name]: { ...this.snapshot[name], running: false },
      };
    }
  }

  private async executeRecovery(name: MeetingRecoveryName): Promise<number> {
    switch (name) {
      case "meeting-answer": {
        const jobs = await this.recovery.listRecoverableMeetingAnswerJobs();
        await this.queueProducer.enqueueMeetingAnswerJobs(jobs);
        return jobs.length;
      }
      case "meeting-intelligence": {
        await this.recovery.recoverMissingMeetingIntelligence();
        const jobs = await this.recovery.listRecoverableMeetingIntelligenceJobs();
        await this.queueProducer.enqueueMeetingIntelligenceJobs(jobs);
        return jobs.length;
      }
      case "meeting-playback": {
        const jobs = await this.recovery.listRecoverableMeetingPlaybackJobs();
        await this.queueProducer.enqueueMeetingPlaybackJobs(jobs);
        return jobs.length;
      }
      case "meeting-purge": {
        const jobs = await this.recovery.listRecoverableMeetingPurgeJobs();
        await this.queueProducer.enqueueMeetingPurgeJobs(jobs);
        return jobs.length;
      }
      case "meeting-transcription": {
        const jobs = await this.recovery.listRecoverableMeetingTranscriptionJobs();
        await this.queueProducer.enqueueMeetingTranscriptionJobs(jobs);
        return jobs.length;
      }
    }
  }
}
