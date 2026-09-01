/* oxlint-disable max-classes-per-file, no-void -- Closely coupled dynamic schedulers share registry ownership; Nest DI and intentional detached timer triggers require these forms. */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import type { MailIngestTriggerJobData } from "@arc/resume-parse-queue/mail-ingest-trigger";
import { BackendConfigService } from "../../../../config/backend-config.service.js";
import { BACKGROUND_WORKLOAD_ADAPTER } from "../../../../background/background.types.js";
import type {
  BackgroundWorkloadAdapter,
  InterviewNotificationSchedulerSnapshot,
  MailIngestConfig,
  MailIngestRunResult,
  MailIngestRunScope,
} from "../../../../background/background.types.js";

const MAIL_INGEST_TIMEOUT = "background:mail-ingest";
const INTERVIEW_NOTIFICATION_INTERVAL = "background:interview-notifications";
const EVENT_LEASE_DURATION_MS = 120_000;

@Injectable()
export class MailIngestSchedulerService {
  private readonly config: MailIngestConfig & { enabled: boolean };
  private readonly logger = new Logger(MailIngestSchedulerService.name);
  private activeRun: Promise<MailIngestRunResult> | null = null;
  private closed = true;

  constructor(
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @Inject(BackendConfigService) config: BackendConfigService,
  ) {
    this.config = {
      enabled: config.get("MAIL_INGEST_ENABLED") ?? false,
      intervalMs: config.get("MAIL_INGEST_INTERVAL_MS") ?? 15 * 60 * 1000,
      maxAccountsPerRun: config.get("MAIL_INGEST_MAX_ACCOUNTS_PER_RUN") ?? 20,
      maxMessagesPerAccount: config.get("MAIL_INGEST_MAX_MESSAGES_PER_ACCOUNT") ?? 20,
    };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  start(): void {
    if (!this.config.enabled) {
      this.logger.log("Mail ingest polling is disabled");
      return;
    }
    this.closed = false;
    this.scheduleNext();
    queueMicrotask(() => void this.runAutomatic());
    this.logger.log("Mail ingest scheduler started", {
      intervalMs: this.config.intervalMs,
      maxAccountsPerRun: this.config.maxAccountsPerRun,
      maxMessagesPerAccount: this.config.maxMessagesPerAccount,
    });
  }

  async runNow(scope: MailIngestRunScope | MailIngestTriggerJobData): Promise<MailIngestRunResult> {
    this.clearTimer();
    this.scheduleNext();
    if (this.activeRun) {
      await Promise.allSettled([this.activeRun]);
    }
    return await this.execute(scope);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.clearTimer();
    if (this.activeRun) {
      await Promise.allSettled([this.activeRun]);
    }
  }

  private async execute(scope?: MailIngestRunScope): Promise<MailIngestRunResult> {
    if (this.activeRun) {
      return await this.activeRun;
    }
    this.activeRun = this.adapter.runMailIngest(this.config, scope);
    try {
      return await this.activeRun;
    } finally {
      this.activeRun = null;
    }
  }

  private async runAutomatic(): Promise<void> {
    if (this.closed || this.activeRun) {
      return;
    }
    try {
      const result = await this.execute();
      this.logger.log("Mail ingest poll finished", result);
    } catch (error) {
      this.logger.error("Mail ingest poll failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  private scheduleNext(): void {
    this.clearTimer();
    if (this.closed) {
      return;
    }
    const timeout = setTimeout(() => {
      this.scheduleNext();
      void this.runAutomatic();
    }, this.config.intervalMs);
    timeout.unref();
    this.schedulerRegistry.addTimeout(MAIL_INGEST_TIMEOUT, timeout);
  }

  private clearTimer(): void {
    if (!this.schedulerRegistry.doesExist("timeout", MAIL_INGEST_TIMEOUT)) {
      return;
    }
    this.schedulerRegistry.deleteTimeout(MAIL_INGEST_TIMEOUT);
  }
}

@Injectable()
export class InterviewNotificationSchedulerService {
  private readonly logger = new Logger(InterviewNotificationSchedulerService.name);
  private readonly leaseOwner = `notification-worker:${process.pid}:${crypto.randomUUID()}`;
  private readonly batchSize: number;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private activeRun: Promise<void> | null = null;
  private closed = true;
  private snapshot: InterviewNotificationSchedulerSnapshot = {
    claimed: 0,
    enabled: false,
    lastErrorAt: null,
    lastRunAt: null,
    lastSuccessAt: null,
    running: false,
  };

  constructor(
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(BACKGROUND_WORKLOAD_ADAPTER)
    private readonly adapter: BackgroundWorkloadAdapter,
    @Inject(BackendConfigService) config: BackendConfigService,
  ) {
    this.batchSize = Math.min(config.get("INTERVIEW_NOTIFICATION_BATCH_SIZE") ?? 20, 100);
    this.enabled =
      (config.get("INTERVIEW_NOTIFICATION_FLOW_ENABLED") ?? false) &&
      (config.get("INTERVIEW_NOTIFICATION_WORKER_ENABLED") ?? false);
    this.intervalMs = config.get("INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS") ?? 5000;
  }

  start(): void {
    if (!this.enabled) {
      this.snapshot = { ...this.snapshot, enabled: false, running: false };
      this.logger.log("Interview notification polling is disabled");
      return;
    }
    this.closed = false;
    const interval = setInterval(() => void this.runOnce(), this.intervalMs);
    interval.unref();
    this.schedulerRegistry.addInterval(INTERVIEW_NOTIFICATION_INTERVAL, interval);
    this.snapshot = { ...this.snapshot, enabled: true };
    queueMicrotask(() => void this.runOnce());
    this.logger.log("Interview notification scheduler started", {
      batchSize: this.batchSize,
      intervalMs: this.intervalMs,
    });
  }

  getSnapshot(): InterviewNotificationSchedulerSnapshot {
    return { ...this.snapshot };
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.schedulerRegistry.doesExist("interval", INTERVIEW_NOTIFICATION_INTERVAL)) {
      this.schedulerRegistry.deleteInterval(INTERVIEW_NOTIFICATION_INTERVAL);
    }
    if (this.activeRun) {
      await Promise.allSettled([this.activeRun]);
    }
    this.snapshot = { ...this.snapshot, running: false };
  }

  private async runOnce(): Promise<void> {
    if (this.closed || this.activeRun) {
      return;
    }
    const runAt = new Date();
    this.snapshot = {
      ...this.snapshot,
      lastRunAt: runAt.toISOString(),
      running: true,
    };
    this.activeRun = this.processBatch();
    try {
      await this.activeRun;
      this.snapshot = { ...this.snapshot, lastSuccessAt: new Date().toISOString() };
    } catch (error) {
      this.snapshot = { ...this.snapshot, lastErrorAt: new Date().toISOString() };
      this.logger.error("Interview notification poll failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      this.activeRun = null;
      this.snapshot = { ...this.snapshot, running: false };
    }
  }

  private async processBatch(): Promise<void> {
    const claimed = await this.adapter.processInterviewNotificationBatch({
      leaseDurationMs: EVENT_LEASE_DURATION_MS,
      leaseOwner: this.leaseOwner,
      limit: this.batchSize,
      now: new Date(),
    });
    this.snapshot = { ...this.snapshot, claimed };
  }
}
