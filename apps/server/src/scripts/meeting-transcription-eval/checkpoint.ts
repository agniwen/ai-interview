import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import writeFileAtomic from "write-file-atomic";
import { meetingTranscriptionProviderSchema } from "@arc/shared/meeting-transcription";
import { meetingTranscriptionBenchmarkRunSchema } from "./types";
import type { MeetingTranscriptionBenchmarkRun } from "./types";

const checkpointSchema = z.object({
  attemptHistory: z
    .array(
      z.object({
        actualCostUsd: z.number().nonnegative(),
        caseId: z.string().min(1),
        deletion: z.enum(["deleted", "delete-failed", "not-applicable", "unsupported"]),
        provider: meetingTranscriptionProviderSchema,
        remoteTaskIds: z.array(z.string().min(1)).max(1000),
      }),
    )
    .default([]),
  corpusFingerprint: z.string().regex(/^[a-f\d]{64}$/),
  expectedCaseIds: z.array(z.string().min(1)).min(20).max(50),
  inFlight: z
    .object({
      caseId: z.string().min(1),
      provider: meetingTranscriptionProviderSchema,
      remoteTaskIds: z.array(z.string().min(1)).max(1000),
    })
    .nullable(),
  runs: z.array(meetingTranscriptionBenchmarkRunSchema),
});
const nodeFileErrorSchema = z.object({ code: z.string().optional() }).passthrough();

interface MeetingTranscriptionBenchmarkCheckpoint {
  attemptHistory: {
    actualCostUsd: number;
    caseId: string;
    deletion: MeetingTranscriptionBenchmarkRun["deletion"];
    provider: MeetingTranscriptionBenchmarkRun["provider"];
    remoteTaskIds: string[];
  }[];
  corpusFingerprint: string;
  expectedCaseIds: string[];
  inFlight: {
    caseId: string;
    provider: MeetingTranscriptionBenchmarkRun["provider"];
    remoteTaskIds: string[];
  } | null;
  runs: MeetingTranscriptionBenchmarkRun[];
}

function assertUniqueRuns(runs: MeetingTranscriptionBenchmarkRun[]) {
  const keys = new Set<string>();
  for (const run of runs) {
    const key = `${run.provider}:${run.caseId}`;
    if (keys.has(key)) {
      throw new Error(`Benchmark checkpoint contains duplicate provider/case: ${key}`);
    }
    keys.add(key);
  }
}

export async function loadMeetingTranscriptionBenchmarkCheckpoint(
  path: string,
  expected: Pick<MeetingTranscriptionBenchmarkCheckpoint, "corpusFingerprint" | "expectedCaseIds">,
): Promise<MeetingTranscriptionBenchmarkCheckpoint> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    const fileError = nodeFileErrorSchema.safeParse(error);
    if (fileError.success && fileError.data.code === "ENOENT") {
      return {
        ...expected,
        attemptHistory: [],
        inFlight: null,
        runs: [],
      };
    }
    throw error;
  }
  const checkpoint = checkpointSchema.parse(JSON.parse(raw));
  if (
    checkpoint.corpusFingerprint !== expected.corpusFingerprint ||
    JSON.stringify(checkpoint.expectedCaseIds) !== JSON.stringify(expected.expectedCaseIds)
  ) {
    throw new Error("Benchmark checkpoint does not match the current corpus");
  }
  assertUniqueRuns(checkpoint.runs);
  if (
    checkpoint.inFlight &&
    checkpoint.runs.some(
      (run) =>
        run.provider === checkpoint.inFlight?.provider && run.caseId === checkpoint.inFlight.caseId,
    )
  ) {
    throw new Error("Benchmark checkpoint marks a completed provider/case as in flight");
  }
  return checkpoint;
}

export async function saveMeetingTranscriptionBenchmarkCheckpoint(
  path: string,
  input: MeetingTranscriptionBenchmarkCheckpoint,
): Promise<void> {
  const checkpoint = checkpointSchema.parse(input);
  assertUniqueRuns(checkpoint.runs);
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    fsync: true,
    mode: 0o600,
  });
}
