import { describe, expect, it, vi } from "vitest";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "../../server/routes/meetings/transcription/provider";
import {
  MeetingTranscriptionBenchmarkCallError,
  runMeetingTranscriptionBenchmarkCase,
} from "./runner";

const reference = {
  language: "zh",
  turns: [
    {
      confidence: null,
      endMs: 1000,
      speakerKey: "local",
      startMs: 0,
      text: "你好",
      track: "local" as const,
    },
  ],
};

const benchmarkCase = {
  assets: [
    {
      contentType: "audio/webm",
      durationMs: 1000,
      path: "audio/case-01.webm",
      sha256: "a".repeat(64),
      sizeBytes: 1024,
      track: "microphone" as const,
    },
  ],
  consent: { confirmed: true as const, scope: "provider-benchmark-v1" as const },
  entities: [],
  id: "case-01",
  overlapIntervals: [],
  reference,
  tags: ["normal"],
};

describe("Meeting transcription benchmark runner provider fixtures", () => {
  it("rejects provider output beyond the benchmark text budget before scoring", async () => {
    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: 1,
      adapter: {
        transcribe: vi.fn(() =>
          Promise.resolve({
            transcript: {
              language: "zh",
              turns: Array.from({ length: 3 }, (_, index) => ({
                confidence: null,
                endMs: index + 1,
                speakerKey: "local",
                startMs: index,
                text: "中".repeat(70_000),
                track: "local" as const,
              })),
            },
          }),
        ),
      },
      benchmarkCase,
      maxAttempts: 1,
      model: "fixture-model",
      provider: "openai",
      region: "openai-default",
    });

    expect(result).toMatchObject({ errorCode: "malformed-response", status: "failed" });
  });

  it.each([
    {
      error: new MeetingProviderQuotaError(),
      expected: "rate-limited",
      name: "rate-limit",
    },
    {
      error: Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      expected: "timeout",
      name: "timeout",
    },
    {
      error: new MeetingProviderResponseError("partial-result", "fixture"),
      expected: "partial-result",
      name: "partial",
    },
    {
      error: new MeetingProviderResponseError("malformed-response", "fixture"),
      expected: "malformed-response",
      name: "malformed",
    },
  ])("classifies $name without leaking provider-native output", async ({ error, expected }) => {
    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: 0.1,
      adapter: {
        deleteArtifact: undefined,
        transcribe: vi.fn(() => Promise.reject(error)),
      },
      benchmarkCase,
      maxAttempts: 2,
      model: "fixture-model",
      provider: "deepgram",
      region: "us",
      retryDelay: () => Promise.resolve(),
    });

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(expected);
    expect(result).not.toHaveProperty("providerResponse");
  });

  it("does not silently repeat an ambiguous timeout paid call", async () => {
    const transcribe = vi.fn(() =>
      Promise.reject(Object.assign(new Error("timed out"), { name: "TimeoutError" })),
    );

    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: null,
      adapter: { transcribe },
      benchmarkCase,
      maxAttempts: 3,
      model: "fixture-model",
      provider: "openai",
      region: "international",
    });

    expect(transcribe).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ errorCode: "timeout", retryCount: 0 });
  });

  it("retains failed remote-task deletion evidence without exposing its identity", async () => {
    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: null,
      adapter: {
        transcribe: () =>
          Promise.reject(
            new MeetingTranscriptionBenchmarkCallError(
              new MeetingProviderResponseError("partial-result", "Tingwu"),
              ["private-task-id"],
            ),
          ),
      },
      benchmarkCase,
      maxAttempts: 3,
      model: "tingwu-offline",
      provider: "tingwu",
      region: "cn-beijing",
    });

    expect(result).toMatchObject({
      deletion: "unsupported",
      errorCode: "partial-result",
      status: "failed",
    });
    expect(JSON.stringify(result)).not.toContain("private-task-id");
  });

  it("records normal success and deletion failure as separate evidence", async () => {
    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: 0.25,
      adapter: {
        deleteArtifact: vi.fn(() => Promise.reject(new Error("delete failed"))),
        transcribe: vi.fn(() =>
          Promise.resolve({ artifact: { id: "artifact-1" }, transcript: reference }),
        ),
      },
      benchmarkCase,
      maxAttempts: 2,
      model: "fixture-model",
      provider: "deepgram",
      region: "us",
    });

    expect(result).toMatchObject({
      actualCostUsd: 0.25,
      deletion: "delete-failed",
      retryCount: 0,
      status: "succeeded",
    });
    expect(result.score?.chineseCharacterErrorRate).toBe(0);
    expect(result).not.toHaveProperty("transcript");
  });

  it("classifies an invalid canonical transcript as malformed", async () => {
    const result = await runMeetingTranscriptionBenchmarkCase({
      actualCostUsd: 0.25,
      adapter: {
        transcribe: vi.fn(() =>
          Promise.resolve({ transcript: { language: "zh", turns: [{}] } as never }),
        ),
      },
      benchmarkCase,
      maxAttempts: 2,
      model: "fixture-model",
      provider: "deepgram",
      region: "us",
    });

    expect(result).toMatchObject({ errorCode: "malformed-response", retryCount: 0 });
  });
});
