import * as Sentry from "@sentry/nestjs";
import type { BackgroundJobFailure } from "../background/background.types.js";
import type { BackendEnvironment } from "../config/backend-environment.schema.js";
import type { DatabaseConnection } from "../infrastructure/database/database-connection.js";
import type { MeetingOperationsRepository } from "../domains/meetings/workloads/infrastructure/meeting-operations.repository.js";
import type { BackgroundRecoveryRepository } from "./background-recovery.repository.js";

type BackgroundCoreConfiguration = Partial<
  Pick<
    BackendEnvironment,
    | "ALIBABA_API_KEY"
    | "BACKGROUND_WORKERS_ENABLED"
    | "DATABASE_URL"
    | "MAIL_INGEST_ENABLED"
    | "MAIL_INGEST_SECRET_KEY"
    | "MEETING_INTELLIGENCE_MODEL"
    | "MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX"
    | "MEETING_TRANSCRIPTION_QWEN_ENABLED"
    | "NODE_ENV"
    | "QDRANT_URL"
    | "REDIS_URL"
    | "RESUME_SEMANTIC_INDEX_ENABLED"
    | "S3_ACCESS_KEY_ID"
    | "S3_BUCKET_NAME"
    | "S3_ENDPOINT"
    | "S3_REGION"
    | "S3_SECRET_ACCESS_KEY"
  >
>;

type BackgroundStringConfigurationKey =
  | "ALIBABA_API_KEY"
  | "DATABASE_URL"
  | "MAIL_INGEST_SECRET_KEY"
  | "MEETING_INTELLIGENCE_MODEL"
  | "MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX"
  | "QDRANT_URL"
  | "REDIS_URL"
  | "S3_ACCESS_KEY_ID"
  | "S3_BUCKET_NAME"
  | "S3_ENDPOINT"
  | "S3_REGION"
  | "S3_SECRET_ACCESS_KEY";

function appendMissing(
  missing: string[],
  env: BackgroundCoreConfiguration,
  names: readonly BackgroundStringConfigurationKey[],
): void {
  for (const name of names) {
    const value = env[name];
    if (!value?.trim()) {
      missing.push(name);
    }
  }
}

export function findMissingBackgroundConfiguration(env: BackgroundCoreConfiguration): string[] {
  const missing: string[] = [];
  appendMissing(missing, env, ["DATABASE_URL", "REDIS_URL"]);
  const storageRequired =
    env.MAIL_INGEST_ENABLED === true ||
    env.MEETING_TRANSCRIPTION_QWEN_ENABLED === true ||
    env.BACKGROUND_WORKERS_ENABLED === true;
  if (storageRequired) {
    appendMissing(missing, env, [
      "S3_BUCKET_NAME",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_ENDPOINT",
      "S3_REGION",
    ]);
  }
  if (env.BACKGROUND_WORKERS_ENABLED === true && !env.MEETING_INTELLIGENCE_MODEL?.trim()) {
    missing.push("MEETING_INTELLIGENCE_MODEL");
  }
  if (env.BACKGROUND_WORKERS_ENABLED === true && !env.ALIBABA_API_KEY?.trim()) {
    missing.push("ALIBABA_API_KEY");
  }
  if (env.MAIL_INGEST_ENABLED === true && !env.MAIL_INGEST_SECRET_KEY?.trim()) {
    missing.push("MAIL_INGEST_SECRET_KEY");
  }
  if (env.RESUME_SEMANTIC_INDEX_ENABLED === true && !env.QDRANT_URL?.trim()) {
    missing.push("QDRANT_URL");
  }
  if (
    env.MEETING_TRANSCRIPTION_QWEN_ENABLED === true &&
    !env.MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX?.trim()
  ) {
    missing.push("MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX");
  }
  return missing;
}

export class BackgroundCoreInfrastructureService {
  private readonly connection: DatabaseConnection;
  private readonly environment: BackgroundCoreConfiguration;
  readonly operations: MeetingOperationsRepository;
  readonly recovery: BackgroundRecoveryRepository;

  constructor(
    connection: DatabaseConnection,
    recovery: BackgroundRecoveryRepository,
    operations: MeetingOperationsRepository,
    environment: BackgroundCoreConfiguration,
  ) {
    this.connection = connection;
    this.environment = environment;
    this.operations = operations;
    this.recovery = recovery;
  }

  assertConfigured(): void {
    const missing = findMissingBackgroundConfiguration(this.environment);
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
      scope.setTag("background.runtime", this.environment.NODE_ENV ?? "development");
      scope.setTag("background.queue", failure.queue);
      if (failure.jobId) {
        scope.setTag("background.job_id", failure.jobId);
      }
      scope.setExtra("attemptsMade", failure.attemptsMade);
      Sentry.captureException(failure.error);
    });
  }
}
