import * as Sentry from "@sentry/nestjs";
import type { BackgroundJobFailure } from "../background/background.types.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import type { BackgroundRecoveryRepository } from "./background-recovery.repository.js";
import type { MeetingOperationsRepository } from "./meeting-operations.repository.js";

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.trim().toLowerCase() ?? "");
}

function appendMissing(missing: string[], env: NodeJS.ProcessEnv, names: readonly string[]): void {
  for (const name of names) {
    if (!env[name]?.trim()) {
      missing.push(name);
    }
  }
}

export function findMissingBackgroundConfiguration(env: NodeJS.ProcessEnv): string[] {
  const missing: string[] = [];
  appendMissing(missing, env, ["DATABASE_URL", "REDIS_URL"]);
  const storageRequired =
    enabled(env.MAIL_INGEST_ENABLED) ||
    enabled(env.MEETING_TRANSCRIPTION_QWEN_ENABLED) ||
    enabled(env.BACKGROUND_WORKERS_ENABLED);
  if (storageRequired) {
    appendMissing(missing, env, [
      "S3_BUCKET_NAME",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_ENDPOINT",
      "S3_REGION",
    ]);
  }
  if (enabled(env.BACKGROUND_WORKERS_ENABLED) && !env.MEETING_INTELLIGENCE_MODEL?.trim()) {
    missing.push("MEETING_INTELLIGENCE_MODEL");
  }
  if (enabled(env.BACKGROUND_WORKERS_ENABLED) && !env.ALIBABA_API_KEY?.trim()) {
    missing.push("ALIBABA_API_KEY");
  }
  if (enabled(env.MAIL_INGEST_ENABLED) && !env.MAIL_INGEST_SECRET_KEY?.trim()) {
    missing.push("MAIL_INGEST_SECRET_KEY");
  }
  if (enabled(env.RESUME_SEMANTIC_INDEX_ENABLED) && !env.QDRANT_URL?.trim()) {
    missing.push("QDRANT_URL");
  }
  if (
    enabled(env.MEETING_TRANSCRIPTION_QWEN_ENABLED) &&
    !env.MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX?.trim()
  ) {
    missing.push("MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX");
  }
  return missing;
}

export class BackgroundCoreInfrastructureService {
  private readonly connection: DatabaseConnection;
  private readonly env: NodeJS.ProcessEnv;
  readonly operations: MeetingOperationsRepository;
  readonly recovery: BackgroundRecoveryRepository;

  constructor(
    connection: DatabaseConnection,
    recovery: BackgroundRecoveryRepository,
    operations: MeetingOperationsRepository,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.connection = connection;
    this.env = env;
    this.operations = operations;
    this.recovery = recovery;
  }

  assertConfigured(): void {
    const missing = findMissingBackgroundConfiguration(this.env);
    if (missing.length > 0) {
      throw new Error(
        `Background infrastructure configuration is incomplete: ${missing.join(", ")}`,
      );
    }
  }

  ping(): Promise<void> {
    return this.connection.ping();
  }

  reportJobFailure(failure: BackgroundJobFailure): void {
    Sentry.withScope((scope) => {
      scope.setTag("background.runtime", this.env.NODE_ENV ?? "development");
      scope.setTag("background.queue", failure.queue);
      if (failure.jobId) {
        scope.setTag("background.job_id", failure.jobId);
      }
      scope.setExtra("attemptsMade", failure.attemptsMade);
      Sentry.captureException(failure.error);
    });
  }
}
