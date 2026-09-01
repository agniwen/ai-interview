import { createRedisConnectionFromUrl } from "@arc/resume-parse-queue/resume-parse";
import type { ConnectionOptions } from "bullmq";
import type { MailIngestConfig } from "./background.types.js";

const TRUE_VALUES = new Set(["1", "true", "yes"]);

function booleanValue(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) {
    return fallback;
  }
  return TRUE_VALUES.has(raw.trim().toLowerCase());
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function isBackgroundWorkersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const canonical = env.BACKGROUND_WORKERS_ENABLED;
  if (canonical !== undefined) {
    return booleanValue(canonical, true);
  }
  return booleanValue(env.WORKER_BACKGROUND_PROCESSING_ENABLED, true);
}

export function isResumeSemanticIndexEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return booleanValue(env.RESUME_SEMANTIC_INDEX_ENABLED, false);
}

export function isInterviewNotificationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    booleanValue(env.INTERVIEW_NOTIFICATION_FLOW_ENABLED, false) &&
    booleanValue(env.INTERVIEW_NOTIFICATION_WORKER_ENABLED, false)
  );
}

export function resolveInterviewNotificationBatchSize(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return Math.min(positiveInteger(env.INTERVIEW_NOTIFICATION_BATCH_SIZE, 20), 100);
}

export function resolveInterviewNotificationIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return positiveInteger(env.INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS, 5000);
}

export function resolveMailIngestConfig(env: NodeJS.ProcessEnv = process.env): MailIngestConfig & {
  enabled: boolean;
} {
  return {
    enabled: booleanValue(env.MAIL_INGEST_ENABLED, false),
    intervalMs: positiveInteger(env.MAIL_INGEST_INTERVAL_MS, 15 * 60 * 1000),
    maxAccountsPerRun: positiveInteger(env.MAIL_INGEST_MAX_ACCOUNTS_PER_RUN, 20),
    maxMessagesPerAccount: positiveInteger(env.MAIL_INGEST_MAX_MESSAGES_PER_ACCOUNT, 20),
  };
}

export function resolveRecoveryIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInteger(env.BACKGROUND_RECOVERY_INTERVAL_MS, 60_000);
}

export function resolveMeetingAnswerConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  return positiveInteger(env.MEETING_ANSWER_CONCURRENCY, 4);
}

export function getBackgroundRedisConnection(
  env: NodeJS.ProcessEnv = process.env,
): ConnectionOptions | undefined {
  const url = env.REDIS_URL?.trim();
  return url ? createRedisConnectionFromUrl(url) : undefined;
}

export function assertBackgroundRedisConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.REDIS_URL?.trim()) {
    throw new Error("REDIS_URL is required when BACKGROUND_WORKERS_ENABLED is enabled.");
  }
}
