import { isResumeParseQueueConfigured } from "@arc/resume-parse-queue/resume-parse";
import { resolveMailIngestConfig } from "./config";

export interface MailIngestScheduler {
  close: () => void;
}

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

  let running = false;
  let closed = false;
  const run = async () => {
    if (running || closed) {
      return;
    }
    running = true;
    try {
      const { runMailIngestOnce } = await import("./processor-runtime");
      const result = await runMailIngestOnce(config);
      console.info("[mail-ingest] poll finished", result);
    } catch (error) {
      console.error("[mail-ingest] poll failed", error);
    } finally {
      running = false;
    }
  };

  const scheduleRun = async () => {
    await run();
  };
  const timer = setInterval(scheduleRun, config.intervalMs);
  timer.unref();
  queueMicrotask(scheduleRun);
  console.info("[mail-ingest] scheduler started", {
    intervalMs: config.intervalMs,
    maxAccountsPerRun: config.maxAccountsPerRun,
    maxMessagesPerAccount: config.maxMessagesPerAccount,
  });

  return {
    close: () => {
      closed = true;
      clearInterval(timer);
    },
  };
}
