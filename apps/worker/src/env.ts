import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const booleanString = z.enum(["1", "true", "yes", "0", "false", "no"]);
const positiveIntegerString = z.string().regex(/^\d+$/);

export function createWorkerEnv(runtimeEnv: Record<string, string | undefined>) {
  return createEnv({
    emptyStringAsUndefined: true,
    runtimeEnvStrict: {
      DATABASE_URL: runtimeEnv.DATABASE_URL,
      INTERVIEW_NOTIFICATION_BATCH_SIZE: runtimeEnv.INTERVIEW_NOTIFICATION_BATCH_SIZE,
      INTERVIEW_NOTIFICATION_FLOW_ENABLED: runtimeEnv.INTERVIEW_NOTIFICATION_FLOW_ENABLED,
      INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS: runtimeEnv.INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS,
      INTERVIEW_NOTIFICATION_WORKER_ENABLED: runtimeEnv.INTERVIEW_NOTIFICATION_WORKER_ENABLED,
      POSTGRES_CONNECT_TIMEOUT_SECONDS: runtimeEnv.POSTGRES_CONNECT_TIMEOUT_SECONDS,
      POSTGRES_IDLE_TIMEOUT_SECONDS: runtimeEnv.POSTGRES_IDLE_TIMEOUT_SECONDS,
      POSTGRES_MAX_LIFETIME_SECONDS: runtimeEnv.POSTGRES_MAX_LIFETIME_SECONDS,
      POSTGRES_POOL_MAX: runtimeEnv.POSTGRES_POOL_MAX,
      REDIS_URL: runtimeEnv.REDIS_URL,
      RESUME_SEMANTIC_INDEX_ENABLED: runtimeEnv.RESUME_SEMANTIC_INDEX_ENABLED,
      WORKER_BACKGROUND_PROCESSING_ENABLED: runtimeEnv.WORKER_BACKGROUND_PROCESSING_ENABLED,
      WORKER_DIAGNOSTICS_SECRET: runtimeEnv.WORKER_DIAGNOSTICS_SECRET,
      WORKER_HOST: runtimeEnv.WORKER_HOST,
      WORKER_PORT: runtimeEnv.WORKER_PORT,
    },
    server: {
      DATABASE_URL: z.url().optional(),
      INTERVIEW_NOTIFICATION_BATCH_SIZE: positiveIntegerString.optional(),
      INTERVIEW_NOTIFICATION_FLOW_ENABLED: booleanString.optional(),
      INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS: positiveIntegerString.optional(),
      INTERVIEW_NOTIFICATION_WORKER_ENABLED: booleanString.optional(),
      POSTGRES_CONNECT_TIMEOUT_SECONDS: positiveIntegerString.optional(),
      POSTGRES_IDLE_TIMEOUT_SECONDS: positiveIntegerString.optional(),
      POSTGRES_MAX_LIFETIME_SECONDS: positiveIntegerString.optional(),
      POSTGRES_POOL_MAX: positiveIntegerString.optional(),
      REDIS_URL: z.url().optional(),
      RESUME_SEMANTIC_INDEX_ENABLED: booleanString.optional(),
      WORKER_BACKGROUND_PROCESSING_ENABLED: booleanString.optional(),
      WORKER_DIAGNOSTICS_SECRET: z.string().trim().min(1).optional(),
      WORKER_HOST: z.string().trim().min(1).optional(),
      WORKER_PORT: positiveIntegerString.optional(),
    },
  });
}

export function validateWorkerEnv(): void {
  createWorkerEnv(process.env);
}

function summarizeUrl(raw: string | undefined): Record<string, string | boolean> | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return {
      host: url.host,
      pathname: url.pathname || "/",
      protocol: url.protocol,
      usesPassword: Boolean(url.password),
      usesUsername: Boolean(url.username),
    };
  } catch {
    return { invalid: true };
  }
}

export interface WorkerConnectionSummary {
  databaseUrl: Record<string, string | boolean> | null;
  redisUrl: Record<string, string | boolean> | null;
}

export function getWorkerConnectionSummary(
  env: Record<string, string | undefined> = process.env,
): WorkerConnectionSummary {
  return {
    databaseUrl: summarizeUrl(env.DATABASE_URL),
    redisUrl: summarizeUrl(env.REDIS_URL),
  };
}
