import { isResumeParseQueueConfigured } from "@app/resume-parse-queue/resume-parse";
import { resolveMailIngestConfig } from "./config";
import type { MailIngestConfig } from "./config";
import type { MailIngestRunScope, RunResult } from "./processor";

type RunMailIngestOnce = (
  config: MailIngestConfig,
  scope?: MailIngestRunScope,
) => Promise<RunResult>;

export interface MailIngestScheduler {
  close: () => void;
  runNow: (scope: MailIngestRunScope) => Promise<RunResult>;
}

// 自动与手动触发共享同一个 activeRun，避免同一进程并发扫描邮箱；手动运行会重置下次轮询。 / Automatic and manual triggers share one activeRun to prevent concurrent mailbox scans; manual runs reset the next poll.
export function createMailIngestScheduler(
  config: MailIngestConfig,
  runMailIngestOnce: RunMailIngestOnce,
): MailIngestScheduler {
  let activeRun: Promise<RunResult> | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const execute = async (scope?: MailIngestRunScope): Promise<RunResult> => {
    if (activeRun) {
      return activeRun;
    }
    activeRun = runMailIngestOnce(config, scope);
    try {
      return await activeRun;
    } finally {
      activeRun = null;
    }
  };

  const runAutomatic = async () => {
    if (activeRun) {
      return;
    }
    try {
      const result = await execute();
      console.info("[mail-ingest] poll finished", result);
    } catch (error) {
      console.error("[mail-ingest] poll failed", error);
    }
  };

  const scheduleNext = () => {
    clearTimer();
    if (closed) {
      return;
    }
    timer = setTimeout(() => {
      scheduleNext();
      void runAutomatic();
    }, config.intervalMs);
    timer.unref();
  };

  queueMicrotask(() => {
    scheduleNext();
    void runAutomatic();
  });

  return {
    close: () => {
      closed = true;
      clearTimer();
    },
    runNow: async (scope) => {
      clearTimer();
      scheduleNext();
      if (activeRun) {
        await Promise.allSettled([activeRun]);
      }
      return await execute(scope);
    },
  };
}

// 仅在功能开关开启且 Redis 队列可用时启动，依赖在首次执行时延迟加载。 / Starts only when the feature flag and Redis queue are ready, lazily loading processing dependencies on first execution.
export function startMailIngestScheduler(): MailIngestScheduler | null {
  const config = resolveMailIngestConfig();
  if (!config.enabled) {
    console.info("[mail-ingest] disabled; set MAIL_INGEST_ENABLED=true to start polling");
    return null;
  }
  if (!isResumeParseQueueConfigured()) {
    console.warn("[mail-ingest] REDIS_URL is not set; mail ingest scheduler is not started.");
    return null;
  }

  const scheduler = createMailIngestScheduler(config, async (runConfig, scope) => {
    const { runMailIngestOnce } = await import("./processor-runtime");
    return runMailIngestOnce(runConfig, scope);
  });
  console.info("[mail-ingest] scheduler started", {
    intervalMs: config.intervalMs,
    maxAccountsPerRun: config.maxAccountsPerRun,
    maxMessagesPerAccount: config.maxMessagesPerAccount,
  });
  return scheduler;
}
