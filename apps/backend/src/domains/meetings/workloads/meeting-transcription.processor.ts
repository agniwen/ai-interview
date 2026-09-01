/* oxlint-disable eslint/max-classes-per-file -- The two provider error classes are the public error protocol consumed by this single processor boundary. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import type { BackendEnvironmentKey } from "../../../config/backend-environment.schema.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";
import pLimit from "p-limit";
import type { BackgroundAttemptContext } from "../../../background/background.types.js";

const execFileAsync = promisify(execFile);
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_DISK_HEADROOM_BYTES = 512 * 1024 * 1024;
const STALE_DIRECTORY_AGE_MS = 24 * 60 * 60 * 1000;

export class MeetingProviderQuotaError extends Error {
  constructor() {
    super("Meeting transcription provider quota is exhausted");
    this.name = "MeetingProviderQuotaError";
  }
}

export class MeetingProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetingProviderResponseError";
  }
}

export interface FinalTranscriptionAudioChunk {
  contentType: string;
  endMs: number;
  filePath: string;
  index: number;
  startMs: number;
  track: "microphone" | "system";
}

interface SourceAsset {
  contentType: string;
  durationMs: number;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  sizeBytes: number;
  status: string;
  storageKey: string;
  track: string;
}

export interface MeetingTranscriptionSource {
  assets: SourceAsset[];
  id: string;
  manifestSha256: string;
  organizationId: string;
}

export type MeetingTranscriptionChunkClaim =
  | { status: "busy" | "claimed" | "not-current" }
  | { status: "ready"; transcript: CanonicalMeetingTranscript };

export interface MeetingTranscriptionProcessorPorts {
  claim(
    input: MeetingTranscriptionJobData & { attempt: number; processingRunId: string },
  ): Promise<"already-ready" | "busy" | "claimed" | "not-current">;
  claimChunk(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
  ): Promise<MeetingTranscriptionChunkClaim>;
  createRunId(): string;
  createWorkingDirectory(): Promise<string>;
  downloadSource(input: { filePath: string; storageKey: string }): Promise<void>;
  ensureDiskCapacity(input: { directory: string; requiredBytes: number }): Promise<void>;
  loadSource(
    input: MeetingTranscriptionJobData,
  ): Promise<MeetingTranscriptionSource | null | undefined>;
  markChunkFailed(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
  ): Promise<void>;
  markFailed(
    input: MeetingTranscriptionJobData & {
      errorCode: "provider-error" | "provider-quota";
      errorMessage: string;
      processingRunId: string;
      terminal: boolean;
    },
  ): Promise<boolean>;
  prepareChunks(input: {
    directory: string;
    sources: {
      durationMs: number;
      filePath: string;
      segments?: SourceAsset["segments"];
      track: "microphone" | "system";
    }[];
  }): Promise<FinalTranscriptionAudioChunk[]>;
  publish(
    input: MeetingTranscriptionJobData & {
      processingRunId: string;
      transcript: CanonicalMeetingTranscript;
    },
  ): Promise<boolean>;
  removeWorkingDirectory(directory: string): Promise<void>;
  requestIntelligence(input: { meetingId: string; organizationId: string }): Promise<void>;
  saveChunkCheckpoint(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
    transcript: CanonicalMeetingTranscript,
  ): Promise<CanonicalMeetingTranscript>;
  transcribeFinal(input: {
    chunks: FinalTranscriptionAudioChunk[];
    job: MeetingTranscriptionJobData;
  }): Promise<CanonicalMeetingTranscript>;
  withMediaPermit<Result>(
    requiredBytes: number,
    task: (reservedBytes: number) => Promise<Result>,
  ): Promise<Result>;
}

function positiveEnvInteger(name: BackendEnvironmentKey, fallback: number): number {
  const value = Number.parseInt(rawBackendEnvironment[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createMediaPermitPool(concurrency: number) {
  let reservedBytes = 0;
  const limit = pLimit(concurrency);
  return <Result>(
    requiredBytes: number,
    task: (totalReservedBytes: number) => Promise<Result>,
  ): Promise<Result> =>
    limit(async () => {
      reservedBytes += requiredBytes;
      try {
        return await task(reservedBytes);
      } finally {
        reservedBytes -= requiredBytes;
      }
    });
}

const withMediaPermit = createMediaPermitPool(
  positiveEnvInteger("MEETING_TRANSCRIPTION_MEDIA_CONCURRENCY", 2),
);

export type MeetingTranscriptionExternalPorts = Omit<
  MeetingTranscriptionProcessorPorts,
  | "createRunId"
  | "createWorkingDirectory"
  | "ensureDiskCapacity"
  | "removeWorkingDirectory"
  | "withMediaPermit"
>;

export function createMeetingTranscriptionProcessorPorts(
  external: MeetingTranscriptionExternalPorts,
): MeetingTranscriptionProcessorPorts {
  return {
    ...external,
    createRunId: randomUUID,
    createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-transcription-")),
    ensureDiskCapacity: async ({ directory, requiredBytes }) => {
      const filesystem = await statfs(directory);
      const availableBytes = filesystem.bavail * filesystem.bsize;
      if (availableBytes < requiredBytes + MIN_DISK_HEADROOM_BYTES) {
        throw new Error("Meeting transcription 工作目录可用空间不足");
      }
    },
    removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
    withMediaPermit,
  };
}

export function assertMeetingTranscriptionFfmpegAvailable(versionLine: string): void {
  if (!versionLine.startsWith("ffmpeg version ")) {
    throw new Error("FFmpeg version output is invalid");
  }
}

export async function validateMeetingTranscriptionRuntime(): Promise<void> {
  const { stdout } = await execFileAsync(
    rawBackendEnvironment.FFMPEG_BIN?.trim() || "ffmpeg",
    ["-version"],
    {
      timeout: 10_000,
    },
  );
  const versionLine = stdout.split("\n")[0] ?? "";
  assertMeetingTranscriptionFfmpegAvailable(versionLine);
  const expected = rawBackendEnvironment.MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX?.trim();
  if (expected && !versionLine.startsWith(expected)) {
    throw new Error(`FFmpeg version mismatch; expected prefix ${expected}`);
  }
}

export async function reapStaleMeetingTranscriptionDirectories(
  rootDirectory = tmpdir(),
  now = Date.now(),
): Promise<void> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("meeting-transcription-"))
      .map(async (entry) => {
        const path = join(rootDirectory, entry.name);
        const details = await stat(path);
        if (now - details.mtimeMs > STALE_DIRECTORY_AGE_MS) {
          await rm(path, { force: true, recursive: true });
        }
      }),
  );
}

export async function prepareMeetingTranscriptionWorkload(): Promise<boolean> {
  await reapStaleMeetingTranscriptionDirectories();
  await validateMeetingTranscriptionRuntime();
  return true;
}

export function mergeMeetingTranscriptionChunkResults(
  results: { chunk: FinalTranscriptionAudioChunk; transcript: CanonicalMeetingTranscript }[],
): CanonicalMeetingTranscript {
  const remoteSpeakers = new Map<string, string>();
  const turns = results.flatMap(({ chunk, transcript }) =>
    transcript.turns.map((turn) => {
      if (turn.track === "local") {
        return turn;
      }
      const identity = `${chunk.track}:${chunk.index}:${turn.speakerKey}`;
      let speakerKey = remoteSpeakers.get(identity);
      if (!speakerKey) {
        speakerKey = `remote-${remoteSpeakers.size + 1}`;
        remoteSpeakers.set(identity, speakerKey);
      }
      return { ...turn, speakerKey };
    }),
  );
  turns.sort(
    (left, right) =>
      left.startMs - right.startMs ||
      left.track.localeCompare(right.track) ||
      left.endMs - right.endMs,
  );
  return canonicalMeetingTranscriptSchema.parse({
    language: results.find((result) => result.transcript.language)?.transcript.language ?? null,
    turns,
  });
}

async function transcribeChunk(input: {
  chunk: FinalTranscriptionAudioChunk;
  job: MeetingTranscriptionJobData;
  ports: MeetingTranscriptionProcessorPorts;
  processingRunId: string;
}): Promise<CanonicalMeetingTranscript | null> {
  const claim = await input.ports.claimChunk(
    { ...input.job, processingRunId: input.processingRunId },
    input.chunk,
  );
  if (claim.status === "not-current") {
    return null;
  }
  if (claim.status === "busy") {
    throw new Error("Meeting transcription chunk is already processing");
  }
  if (claim.status === "ready") {
    return claim.transcript;
  }
  let providerResult: CanonicalMeetingTranscript;
  try {
    providerResult = await input.ports.transcribeFinal({ chunks: [input.chunk], job: input.job });
  } catch (error) {
    try {
      await input.ports.markChunkFailed(
        { ...input.job, processingRunId: input.processingRunId },
        input.chunk,
      );
    } catch (markError) {
      console.error("[meeting-transcription-worker] failed to release provider-failed chunk", {
        errorName: markError instanceof Error ? markError.name : "UnknownError",
        meetingId: input.job.meetingId,
      });
    }
    throw error;
  }
  return input.ports.saveChunkCheckpoint(
    { ...input.job, processingRunId: input.processingRunId },
    input.chunk,
    providerResult,
  );
}

async function requestIntelligenceBestEffort(
  input: MeetingTranscriptionJobData,
  ports: MeetingTranscriptionProcessorPorts,
): Promise<void> {
  try {
    await ports.requestIntelligence(input);
  } catch (error) {
    console.error("[meeting-transcription-worker] failed to request Meeting Intelligence", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

// oxlint-disable-next-line complexity -- Admission, checkpoints, media permits and failure persistence are one job boundary.
export async function processMeetingTranscriptionWorkload(
  input: MeetingTranscriptionJobData,
  context: BackgroundAttemptContext,
  ports: MeetingTranscriptionProcessorPorts,
): Promise<void> {
  const meeting = await ports.loadSource(input);
  if (!meeting) {
    throw new Error("Meeting Session 不存在");
  }
  const processingRunId = ports.createRunId();
  const claim = await ports.claim({ ...input, attempt: context.attempt, processingRunId });
  if (claim === "already-ready") {
    await requestIntelligenceBestEffort(input, ports);
    return;
  }
  if (claim !== "claimed") {
    return;
  }
  let workingDirectory: string | null = null;
  try {
    if (meeting.manifestSha256 !== input.sourceManifestSha256) {
      throw new Error("Meeting Recording 清单已变化");
    }
    const microphone = meeting.assets.find((asset) => asset.track === "microphone");
    const system = meeting.assets.find((asset) => asset.track === "system");
    if (!(microphone?.status === "ready" && system?.status === "ready")) {
      throw new Error("Meeting Recording 源音轨尚未完整验证");
    }
    const sourceBytes = microphone.sizeBytes + system.sizeBytes;
    if (
      microphone.sizeBytes > MAX_SOURCE_BYTES ||
      system.sizeBytes > MAX_SOURCE_BYTES ||
      sourceBytes > MAX_TOTAL_SOURCE_BYTES ||
      microphone.durationMs > MAX_DURATION_MS ||
      system.durationMs > MAX_DURATION_MS
    ) {
      throw new Error("Meeting Recording 超出最终转录的资源预算");
    }
    const prepared = await ports.withMediaPermit(sourceBytes * 2, async (reservedBytes) => {
      const directory = await ports.createWorkingDirectory();
      workingDirectory = directory;
      await ports.ensureDiskCapacity({ directory, requiredBytes: reservedBytes });
      const microphonePath = join(directory, "microphone-source.webm");
      const systemPath = join(directory, "system-source.webm");
      await Promise.all([
        ports.downloadSource({ filePath: microphonePath, storageKey: microphone.storageKey }),
        ports.downloadSource({ filePath: systemPath, storageKey: system.storageKey }),
      ]);
      return ports.prepareChunks({
        directory,
        sources: [
          {
            durationMs: microphone.durationMs,
            filePath: microphonePath,
            segments: microphone.segments,
            track: "microphone",
          },
          {
            durationMs: system.durationMs,
            filePath: systemPath,
            segments: system.segments,
            track: "system",
          },
        ],
      });
    });
    const chunkResults: {
      chunk: FinalTranscriptionAudioChunk;
      transcript: CanonicalMeetingTranscript;
    }[] = [];
    for (const chunk of prepared) {
      const transcript = await transcribeChunk({ chunk, job: input, ports, processingRunId });
      if (!transcript) {
        return;
      }
      chunkResults.push({ chunk, transcript });
    }
    const published = await ports.publish({
      ...input,
      processingRunId,
      transcript: mergeMeetingTranscriptionChunkResults(chunkResults),
    });
    if (published) {
      await requestIntelligenceBestEffort(input, ports);
    }
  } catch (error) {
    try {
      await ports.markFailed({
        ...input,
        errorCode: error instanceof MeetingProviderQuotaError ? "provider-quota" : "provider-error",
        errorMessage:
          error instanceof Error ? error.message : "Meeting transcription processing failed",
        processingRunId,
        terminal:
          error instanceof MeetingProviderResponseError || context.attempt >= context.maxAttempts,
      });
    } catch (markError) {
      console.error("[meeting-transcription-worker] failed to persist processing failure", {
        errorName: markError instanceof Error ? markError.name : "UnknownError",
        meetingId: input.meetingId,
      });
    }
    throw error;
  } finally {
    if (workingDirectory) {
      await ports.removeWorkingDirectory(workingDirectory);
    }
  }
}
