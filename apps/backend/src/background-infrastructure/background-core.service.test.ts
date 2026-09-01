import { describe, expect, it } from "vitest";
import { findMissingBackgroundConfiguration } from "./background-core.service.js";

describe("findMissingBackgroundConfiguration", () => {
  it("validates only enabled optional capabilities", () => {
    expect(
      findMissingBackgroundConfiguration({
        ALIBABA_API_KEY: "ai-key",
        BACKGROUND_WORKERS_ENABLED: "true",
        DATABASE_URL: "postgres://database",
        MEETING_INTELLIGENCE_MODEL: "provider/model",
        REDIS_URL: "redis://redis",
        S3_ACCESS_KEY_ID: "access",
        S3_BUCKET_NAME: "bucket",
        S3_ENDPOINT: "https://storage.example.com",
        S3_REGION: "auto",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual([]);
  });

  it("requires Qwen provider and pinned FFmpeg configuration when transcription is enabled", () => {
    expect(
      findMissingBackgroundConfiguration({
        BACKGROUND_WORKERS_ENABLED: "true",
        DATABASE_URL: "postgres://database",
        MEETING_INTELLIGENCE_MODEL: "provider/model",
        MEETING_TRANSCRIPTION_QWEN_ENABLED: "true",
        REDIS_URL: "redis://redis",
        S3_ACCESS_KEY_ID: "access",
        S3_BUCKET_NAME: "bucket",
        S3_ENDPOINT: "https://storage.example.com",
        S3_REGION: "auto",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual(["ALIBABA_API_KEY", "MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX"]);
  });

  it("requires mail secret and Qdrant only when their workers are enabled", () => {
    expect(
      findMissingBackgroundConfiguration({
        ALIBABA_API_KEY: "ai-key",
        BACKGROUND_WORKERS_ENABLED: "true",
        DATABASE_URL: "postgres://database",
        MAIL_INGEST_ENABLED: "true",
        MEETING_INTELLIGENCE_MODEL: "provider/model",
        REDIS_URL: "redis://redis",
        RESUME_SEMANTIC_INDEX_ENABLED: "true",
        S3_ACCESS_KEY_ID: "access",
        S3_BUCKET_NAME: "bucket",
        S3_ENDPOINT: "https://storage.example.com",
        S3_REGION: "auto",
        S3_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual(["MAIL_INGEST_SECRET_KEY", "QDRANT_URL"]);
  });
});
