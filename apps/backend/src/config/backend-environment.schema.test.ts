import { describe, expect, it } from "vitest";
import { backendEnvironmentSchema } from "./backend-environment.schema.js";

const baseEnvironment = {
  BACKGROUND_WORKERS_ENABLED: "false",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:8787",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/arc",
};

function issuePaths(environment: Record<string, string>): string[] {
  const result = backendEnvironmentSchema.safeParse(environment);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("backend environment schema", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["yes", true],
    [" TRUE ", true],
    ["0", false],
    ["false", false],
    ["no", false],
    [" NO ", false],
  ])("parses legacy boolean value %j as %j", (raw, expected) => {
    const result = backendEnvironmentSchema.safeParse({
      ...baseEnvironment,
      READINESS_DATABASE_CHECK_ENABLED: raw,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.READINESS_DATABASE_CHECK_ENABLED).toBe(expected);
    }
  });

  it.each([
    [undefined, undefined, true],
    [undefined, "true", true],
    [undefined, "1", true],
    [undefined, "yes", true],
    [undefined, "false", false],
    [undefined, "0", false],
    [undefined, "no", false],
    ["true", "false", true],
    ["false", "true", false],
  ])(
    "resolves background workers from canonical=%j legacy=%j as %j",
    (canonical, legacy, expected) => {
      const result = backendEnvironmentSchema.safeParse({
        ...baseEnvironment,
        ALIBABA_API_KEY: "test-key",
        BACKGROUND_WORKERS_ENABLED: canonical,
        MEETING_INTELLIGENCE_MODEL: "test-model",
        REDIS_URL: "redis://localhost:6379",
        S3_ACCESS_KEY_ID: "test-access-key",
        S3_BUCKET_NAME: "test-bucket",
        S3_ENDPOINT: "https://storage.example.com",
        S3_REGION: "auto",
        S3_SECRET_ACCESS_KEY: "test-secret-key",
        WORKER_BACKGROUND_PROCESSING_ENABLED: legacy,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.BACKGROUND_WORKERS_ENABLED).toBe(expected);
      }
    },
  );

  it("accepts an HTTP-only replica without background dependencies", () => {
    expect(backendEnvironmentSchema.safeParse(baseEnvironment).success).toBe(true);
  });

  it("fails fast when background workers lack queue, storage, and AI configuration", () => {
    const paths = issuePaths({ ...baseEnvironment, BACKGROUND_WORKERS_ENABLED: "true" });

    expect(paths).toEqual(
      expect.arrayContaining([
        "ALIBABA_API_KEY",
        "MEETING_INTELLIGENCE_MODEL",
        "REDIS_URL",
        "S3_BUCKET_NAME",
      ]),
    );
  });

  it("validates dependencies owned by independently enabled features", () => {
    const paths = issuePaths({
      ...baseEnvironment,
      INTERVIEW_NOTIFICATION_FLOW_ENABLED: "true",
      INTERVIEW_NOTIFICATION_WORKER_ENABLED: "true",
      MAIL_INGEST_ENABLED: "true",
      NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING: "true",
    });

    expect(paths).toEqual(
      expect.arrayContaining([
        "LIVEKIT_URL",
        "MAIL_INGEST_SECRET_KEY",
        "RECORDING_R2_BUCKET_NAME",
        "RESEND_API_KEY",
        "RESEND_FROM",
      ]),
    );
  });
});
