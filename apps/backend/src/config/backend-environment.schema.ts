import { z } from "zod";

const booleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");
const optionalBooleanStringSchema = booleanStringSchema.optional();
const optionalUrlSchema = z.union([z.literal(""), z.url()]).optional();

export const backendEnvironmentSchema = z
  .object({
    BACKGROUND_WORKERS_ENABLED: booleanStringSchema.default(true),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.url(),
    FEISHU_APP_ID: z.string().optional(),
    FEISHU_APP_ID2: z.string().optional(),
    FEISHU_APP_SECRET: z.string().optional(),
    FEISHU_APP_SECRET2: z.string().optional(),
    FEISHU_BOT_ENABLED: optionalBooleanStringSchema,
    FEISHU_HUMAN_INTERVIEW_ENABLED: optionalBooleanStringSchema,
    HOST: z.string().default("0.0.0.0"),
    JSON_BODY_LIMIT: z.string().default("10mb"),
    NODE_ENV: z.enum(["development", "production", "test", "provision"]).default("development"),
    PORT: z.coerce.number().int().positive().max(65_535).default(8787),
    POSTGRES_BACKGROUND_POOL_MAX: z.coerce.number().int().positive().optional(),
    POSTGRES_CONNECT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(10),
    POSTGRES_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
    POSTGRES_MAX_LIFETIME_SECONDS: z.coerce.number().int().positive().default(1200),
    POSTGRES_POOL_MAX: z.coerce.number().int().positive().optional(),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_URL: optionalUrlSchema,
    READINESS_DATABASE_CHECK_ENABLED: booleanStringSchema.default(true),
    REDIS_URL: optionalUrlSchema,
    RESUME_EMBEDDING_API_KEY: z.string().optional(),
    RESUME_SEMANTIC_INDEX_ENABLED: booleanStringSchema.default(false),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_BUCKET_NAME: z.string().optional(),
    S3_ENDPOINT: optionalUrlSchema,
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    SENTRY_DSN: optionalUrlSchema,
    WORKER_DIAGNOSTICS_SECRET: z.string().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (environment.BACKGROUND_WORKERS_ENABLED && !environment.REDIS_URL) {
      context.addIssue({
        code: "custom",
        message: "REDIS_URL is required when background workers are enabled",
        path: ["REDIS_URL"],
      });
    }

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
