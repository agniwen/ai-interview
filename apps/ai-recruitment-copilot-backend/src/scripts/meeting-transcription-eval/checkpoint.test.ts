import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadMeetingTranscriptionBenchmarkCheckpoint,
  saveMeetingTranscriptionBenchmarkCheckpoint,
} from "./checkpoint";
import type { MeetingTranscriptionBenchmarkRun } from "./types";

const run: MeetingTranscriptionBenchmarkRun = {
  actualCostUsd: null,
  caseId: "case-01",
  deletion: "not-applicable",
  latencyMs: 1000,
  model: "model",
  provider: "openai",
  region: "international",
  retryCount: 0,
  score: null,
  status: "failed",
};

describe("Meeting transcription benchmark checkpoint", () => {
  it("atomically resumes completed provider/case pairs for the same corpus", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-eval-"));
    const path = join(directory, "run.partial.json");
    const input = {
      attemptHistory: [],
      corpusFingerprint: "a".repeat(64),
      expectedCaseIds: Array.from({ length: 20 }, (_, index) => `case-${index + 1}`),
      inFlight: null,
      runs: [run],
    };

    await saveMeetingTranscriptionBenchmarkCheckpoint(path, input);

    await expect(
      loadMeetingTranscriptionBenchmarkCheckpoint(path, {
        corpusFingerprint: input.corpusFingerprint,
        expectedCaseIds: input.expectedCaseIds,
      }),
    ).resolves.toEqual(input);
    expect(JSON.parse(await readFile(path, "utf-8"))).toEqual(input);
  });

  it("refuses a checkpoint from another corpus or with duplicate paid runs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-eval-"));
    const path = join(directory, "run.partial.json");
    const expectedCaseIds = Array.from({ length: 20 }, (_, index) => `case-${index + 1}`);

    await saveMeetingTranscriptionBenchmarkCheckpoint(path, {
      attemptHistory: [],
      corpusFingerprint: "a".repeat(64),
      expectedCaseIds,
      inFlight: null,
      runs: [run],
    });
    await expect(
      loadMeetingTranscriptionBenchmarkCheckpoint(path, {
        corpusFingerprint: "b".repeat(64),
        expectedCaseIds,
      }),
    ).rejects.toThrow("does not match");
    await expect(
      saveMeetingTranscriptionBenchmarkCheckpoint(path, {
        attemptHistory: [],
        corpusFingerprint: "a".repeat(64),
        expectedCaseIds,
        inFlight: null,
        runs: [run, run],
      }),
    ).rejects.toThrow("duplicate provider/case");
  });

  it("persists an ambiguous in-flight paid call for explicit operator recovery", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-eval-"));
    const path = join(directory, "run.partial.json");
    const expectedCaseIds = Array.from({ length: 20 }, (_, index) => `case-${index + 1}`);

    await saveMeetingTranscriptionBenchmarkCheckpoint(path, {
      attemptHistory: [],
      corpusFingerprint: "a".repeat(64),
      expectedCaseIds,
      inFlight: { caseId: "case-02", provider: "deepgram", remoteTaskIds: ["private-task-1"] },
      runs: [run],
    });

    await expect(
      loadMeetingTranscriptionBenchmarkCheckpoint(path, {
        corpusFingerprint: "a".repeat(64),
        expectedCaseIds,
      }),
    ).resolves.toMatchObject({
      attemptHistory: [],
      inFlight: { caseId: "case-02", provider: "deepgram", remoteTaskIds: ["private-task-1"] },
    });
  });

  it("keeps reconciled ambiguous attempts as private durable evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-eval-"));
    const path = join(directory, "run.partial.json");
    const expectedCaseIds = Array.from({ length: 20 }, (_, index) => `case-${index + 1}`);
    const attemptHistory = [
      {
        actualCostUsd: 0.42,
        caseId: "case-02",
        deletion: "unsupported" as const,
        provider: "tingwu" as const,
        remoteTaskIds: ["private-task-1"],
      },
    ];

    await saveMeetingTranscriptionBenchmarkCheckpoint(path, {
      attemptHistory,
      corpusFingerprint: "a".repeat(64),
      expectedCaseIds,
      inFlight: null,
      runs: [run],
    });

    await expect(
      loadMeetingTranscriptionBenchmarkCheckpoint(path, {
        corpusFingerprint: "a".repeat(64),
        expectedCaseIds,
      }),
    ).resolves.toMatchObject({ attemptHistory });
  });
});
