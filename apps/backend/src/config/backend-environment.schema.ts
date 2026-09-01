import { z } from "zod";

const legacyBooleanStringSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["1", "true", "yes", "0", "false", "no"]))
  .transform((value) => value === "1" || value === "true" || value === "yes");
const optionalBooleanStringSchema = legacyBooleanStringSchema.optional();
const optionalUrlSchema = z.union([z.literal(""), z.url()]).optional();
const optionalStringSchema = z.string().optional();
const optionalPositiveIntegerSchema = z.coerce.number().int().positive().optional();
const optionalNonNegativeNumberSchema = z.coerce.number().nonnegative().optional();

export const backendEnvironmentFields = {
  AGENT_CALLBACK_SECRET: optionalStringSchema,
  AGENT_NAME: optionalStringSchema,
  AI_GATEWAY_API_KEY: optionalStringSchema,
  ALIBABA_API_KEY: optionalStringSchema,
  ALIBABA_BASE_URL: optionalUrlSchema,
  ALIBABA_FAST_MODEL: optionalStringSchema,
  ALIBABA_MODEL: optionalStringSchema,
  ALIBABA_STRUCTURED_MODEL: optionalStringSchema,
  ALIBABA_TEXT_MODEL: optionalStringSchema,
  BACKGROUND_RECOVERY_INTERVAL_MS: optionalPositiveIntegerSchema,
  BACKGROUND_WORKERS_ENABLED: optionalBooleanStringSchema,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_TRUSTED_ORIGINS: optionalStringSchema,
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.url(),
  DEEPGRAM_API_KEY: optionalStringSchema,
  DEEPGRAM_BASE_URL: optionalUrlSchema,
  FEISHU_APP_ID: z.string().optional(),
  FEISHU_APP_ID2: z.string().optional(),
  FEISHU_APP_SECRET: z.string().optional(),
  FEISHU_APP_SECRET2: z.string().optional(),
  FEISHU_BOT_ENABLED: optionalBooleanStringSchema,
  FEISHU_EVALUATION_FOLDER_TOKEN: optionalStringSchema,
  FEISHU_HUMAN_INTERVIEW_ENABLED: optionalBooleanStringSchema,
  FEISHU_JIGUANG_HR_EVALUATION_FOLDER_TOKEN: optionalStringSchema,
  FFMPEG_BIN: optionalStringSchema,
  GOOGLE_CLIENT_ID: optionalStringSchema,
  GOOGLE_CLIENT_SECRET: optionalStringSchema,
  HOST: z.string().default("0.0.0.0"),
  INTERVIEW_EVALUATION_MODEL: optionalStringSchema,
  INTERVIEW_NOTIFICATION_BATCH_SIZE: optionalPositiveIntegerSchema,
  INTERVIEW_NOTIFICATION_FLOW_ENABLED: optionalBooleanStringSchema,
  INTERVIEW_NOTIFICATION_POLL_INTERVAL_MS: optionalPositiveIntegerSchema,
  INTERVIEW_NOTIFICATION_WORKER_ENABLED: optionalBooleanStringSchema,
  INTERVIEW_SMS_ENABLED: optionalBooleanStringSchema,
  JSON_BODY_LIMIT: z.string().default("10mb"),
  LIBREOFFICE_BIN: optionalStringSchema,
  LIVEKIT_API_KEY: optionalStringSchema,
  LIVEKIT_API_SECRET: optionalStringSchema,
  LIVEKIT_PROMETHEUS_URL: optionalUrlSchema,
  LIVEKIT_URL: optionalUrlSchema,
  MAIL_INGEST_ENABLED: optionalBooleanStringSchema,
  MAIL_INGEST_INTERVAL_MS: optionalPositiveIntegerSchema,
  MAIL_INGEST_MAX_ACCOUNTS_PER_RUN: optionalPositiveIntegerSchema,
  MAIL_INGEST_MAX_MESSAGES_PER_ACCOUNT: optionalPositiveIntegerSchema,
  MAIL_INGEST_SECRET_KEY: optionalStringSchema,
  MASTRA_CHAT_MODEL: optionalStringSchema,
  MASTRA_FAST_MODEL: optionalStringSchema,
  MASTRA_POSTGRES_SCHEMA: optionalStringSchema,
  MASTRA_STRUCTURED_MODEL: optionalStringSchema,
  MASTRA_TEXT_MODEL: optionalStringSchema,
  MEETING_ANSWER_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_ANSWER_MODEL: optionalStringSchema,
  MEETING_DIRECT_UPLOAD_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_INTELLIGENCE_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_INTELLIGENCE_MAX_REDUCE_CHARS: optionalPositiveIntegerSchema,
  MEETING_INTELLIGENCE_MAX_TRANSCRIPT_CHARS: optionalPositiveIntegerSchema,
  MEETING_INTELLIGENCE_MODEL: optionalStringSchema,
  MEETING_LIVE_TRANSCRIPT_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_PLAYBACK_WORKER_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_PURGE_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_TITLE_MODEL: optionalStringSchema,
  MEETING_TRANSCRIPTION_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS: optionalPositiveIntegerSchema,
  MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX: optionalStringSchema,
  MEETING_TRANSCRIPTION_MEDIA_CONCURRENCY: optionalPositiveIntegerSchema,
  MEETING_TRANSCRIPTION_QWEN_BASE_URL: optionalUrlSchema,
  MEETING_TRANSCRIPTION_QWEN_ENABLED: optionalBooleanStringSchema,
  MEETING_TRANSCRIPTION_QWEN_LIVE_LANGUAGE: optionalStringSchema,
  MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL: optionalStringSchema,
  MEETING_TRANSCRIPTION_QWEN_LIVE_SPEECH_NOISE_THRESHOLD: optionalNonNegativeNumberSchema,
  MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS: optionalPositiveIntegerSchema,
  MEETING_TRANSCRIPTION_QWEN_MODEL: optionalStringSchema,
  MEETING_TRANSCRIPTION_QWEN_URL_EXPIRES_SECONDS: optionalPositiveIntegerSchema,
  MINIMAX_API_KEY: optionalStringSchema,
  MINIMAX_TTS_BASE_URL: optionalUrlSchema,
  NEXT_PUBLIC_BASE_URL: optionalUrlSchema,
  NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS: optionalBooleanStringSchema,
  NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: optionalBooleanStringSchema,
  NODE_ENV: z.enum(["development", "production", "test", "provision"]).default("development"),
  OPENAI_API_KEY: optionalStringSchema,
  OPENAI_BASE_URL: optionalUrlSchema,
  OPENAI_MODEL: optionalStringSchema,
  PORT: z.coerce.number().int().positive().max(65_535).default(8787),
  POSTGRES_BACKGROUND_POOL_MAX: z.coerce.number().int().positive().optional(),
  POSTGRES_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
  POSTGRES_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  POSTGRES_MAX_LIFETIME_SECONDS: z.coerce.number().int().positive().default(1200),
  POSTGRES_POOL_MAX: z.coerce.number().int().positive().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_RESUME_COLLECTION: optionalStringSchema,
  QDRANT_URL: optionalUrlSchema,
  QWEN_OCR_BASE_URL: optionalUrlSchema,
  QWEN_OCR_MODEL: optionalStringSchema,
  READINESS_DATABASE_CHECK_ENABLED: legacyBooleanStringSchema.default(true),
  RECORDING_R2_ACCESS_KEY_ID: optionalStringSchema,
  RECORDING_R2_BUCKET_NAME: optionalStringSchema,
  RECORDING_R2_ENDPOINT: optionalUrlSchema,
  RECORDING_R2_FORCE_PATH_STYLE: optionalBooleanStringSchema,
  RECORDING_R2_KEY_PREFIX: optionalStringSchema,
  RECORDING_R2_REGION: optionalStringSchema,
  RECORDING_R2_SECRET_ACCESS_KEY: optionalStringSchema,
  REDIS_URL: optionalUrlSchema,
  RESEND_API_KEY: optionalStringSchema,
  RESEND_FROM: optionalStringSchema,
  RESUME_EMBEDDING_API_KEY: z.string().optional(),
  RESUME_EMBEDDING_BASE_URL: optionalUrlSchema,
  RESUME_EMBEDDING_DIMENSIONS: optionalPositiveIntegerSchema,
  RESUME_EMBEDDING_MODEL: optionalStringSchema,
  RESUME_EMBEDDING_VERSION: optionalStringSchema,
  RESUME_PARSE_DISABLE_CACHE: optionalBooleanStringSchema,
  RESUME_PARSE_LOG_STEPS: optionalBooleanStringSchema,
  RESUME_PARSE_MODEL: optionalStringSchema,
  RESUME_PARSE_OCR_ATTEMPTS: optionalPositiveIntegerSchema,
  RESUME_PARSE_OCR_PAGE_CONCURRENCY: optionalPositiveIntegerSchema,
  RESUME_PARSE_OCR_RETRY_DELAY_MS: optionalPositiveIntegerSchema,
  RESUME_PARSE_PROVIDER: optionalStringSchema,
  RESUME_PARSE_QUEUE_ATTEMPTS: optionalPositiveIntegerSchema,
  RESUME_PARSE_QUEUE_BACKOFF_MS: optionalPositiveIntegerSchema,
  RESUME_PARSE_STALE_PROCESSING_SECONDS: optionalPositiveIntegerSchema,
  RESUME_PARSE_WORKER_CONCURRENCY: optionalPositiveIntegerSchema,
  RESUME_REVIEW_GENERATION_QUEUE_ATTEMPTS: optionalPositiveIntegerSchema,
  RESUME_REVIEW_GENERATION_WORKER_CONCURRENCY: optionalPositiveIntegerSchema,
  RESUME_REVIEW_MODEL: optionalStringSchema,
  RESUME_SEMANTIC_INDEX_ENABLED: legacyBooleanStringSchema.default(false),
  RESUME_SEMANTIC_INDEX_WORKER_CONCURRENCY: optionalPositiveIntegerSchema,
  RESUME_TITLE_MODEL: optionalStringSchema,
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: optionalUrlSchema,
  S3_FORCE_PATH_STYLE: optionalBooleanStringSchema,
  S3_KEY_PREFIX: optionalStringSchema,
  S3_REGION: optionalStringSchema,
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  SENTRY_BACKEND_DSN: optionalUrlSchema,
  SENTRY_DSN: optionalUrlSchema,
  SENTRY_ENVIRONMENT: optionalStringSchema,
  SENTRY_RELEASE: optionalStringSchema,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),
  SENTRY_WORKER_DSN: optionalUrlSchema,
  SHUTDOWN_TIMEOUT_MS: optionalPositiveIntegerSchema,
  TRUSTED_ORIGINS: optionalStringSchema,
  WORKER_BACKGROUND_PROCESSING_ENABLED: optionalBooleanStringSchema,
  WORKER_DIAGNOSTICS_SECRET: z.string().optional(),
} as const;

export type BackendEnvironmentKey = keyof typeof backendEnvironmentFields;

type RefinementEnvironment = Partial<Record<BackendEnvironmentKey, boolean | number | string>>;

function requireWhenEnabled(
  environment: RefinementEnvironment,
  context: z.core.$RefinementCtx,
  enabled: boolean,
  names: readonly BackendEnvironmentKey[],
): void {
  if (!enabled) {
    return;
  }
  for (const name of names) {
    if (!z.string().trim().min(1).safeParse(environment[name]).success) {
      context.addIssue({
        code: "custom",
        message: `${name} is required when its owning feature is enabled`,
        path: [name],
      });
    }
  }
}

export const backendEnvironmentSchema = z
  .object(backendEnvironmentFields)
  .passthrough()
  .transform((environment) => ({
    ...environment,
    BACKGROUND_WORKERS_ENABLED:
      environment.BACKGROUND_WORKERS_ENABLED ??
      environment.WORKER_BACKGROUND_PROCESSING_ENABLED ??
      true,
  }))
  .superRefine((environment, context) => {
    if (environment.BACKGROUND_WORKERS_ENABLED && !environment.REDIS_URL) {
      context.addIssue({
        code: "custom",
        message: "REDIS_URL is required when background workers are enabled",
        path: ["REDIS_URL"],
      });
    }

    requireWhenEnabled(environment, context, environment.BACKGROUND_WORKERS_ENABLED, [
      "ALIBABA_API_KEY",
      "MEETING_INTELLIGENCE_MODEL",
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET_NAME",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
    ]);

    requireWhenEnabled(environment, context, environment.MAIL_INGEST_ENABLED === true, [
      "MAIL_INGEST_SECRET_KEY",
      "S3_ACCESS_KEY_ID",
      "S3_BUCKET_NAME",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_SECRET_ACCESS_KEY",
    ]);

    requireWhenEnabled(
      environment,
      context,
      environment.INTERVIEW_NOTIFICATION_FLOW_ENABLED === true &&
        environment.INTERVIEW_NOTIFICATION_WORKER_ENABLED === true,
      ["RESEND_API_KEY", "RESEND_FROM"],
    );

    requireWhenEnabled(
      environment,
      context,
      environment.MEETING_TRANSCRIPTION_QWEN_ENABLED === true,
      ["ALIBABA_API_KEY", "MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX"],
    );

    requireWhenEnabled(
      environment,
      context,
      environment.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING === true,
      [
        "LIVEKIT_API_KEY",
        "LIVEKIT_API_SECRET",
        "LIVEKIT_URL",
        "RECORDING_R2_ACCESS_KEY_ID",
        "RECORDING_R2_BUCKET_NAME",
        "RECORDING_R2_ENDPOINT",
        "RECORDING_R2_REGION",
        "RECORDING_R2_SECRET_ACCESS_KEY",
      ],
    );

    if (environment.FEISHU_BOT_ENABLED || environment.FEISHU_HUMAN_INTERVIEW_ENABLED) {
      for (const name of ["FEISHU_APP_ID", "FEISHU_APP_SECRET"] as const) {
        if (!environment[name]) {
          context.addIssue({
            code: "custom",
            message: `${name} is required when a Feishu feature is enabled`,
            path: [name],
          });
        }
      }
    }

    if (environment.RESUME_SEMANTIC_INDEX_ENABLED) {
      if (!environment.QDRANT_URL) {
        context.addIssue({
          code: "custom",
          message: "QDRANT_URL is required when resume semantic indexing is enabled",
          path: ["QDRANT_URL"],
        });
      }
      if (!(environment.RESUME_EMBEDDING_API_KEY || environment.ALIBABA_API_KEY)) {
        context.addIssue({
          code: "custom",
          message:
            "RESUME_EMBEDDING_API_KEY or ALIBABA_API_KEY is required when resume semantic indexing is enabled",
          path: ["RESUME_EMBEDDING_API_KEY"],
        });
      }
    }
  });

export type BackendEnvironment = z.output<typeof backendEnvironmentSchema>;
