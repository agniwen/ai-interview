import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { downloadMeetingRecordingObjectToFile } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  loadMeetingTranscriptionSource,
  markMeetingTranscriptionChunkFailed,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
  saveMeetingTranscriptionChunkCheckpoint,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/dao";
import { createOpenAiMeetingTranscriptionProvider } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/providers/openai";
import { requestAutomaticMeetingIntelligence } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/service";
import type {
  FinalTranscriptionAudioChunk,
  MeetingTranscriptionProvider,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider";
import { MeetingProviderQuotaError } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";

const execFileAsync = promisify(execFile);
const CHUNK_DURATION_MS = 30 * 60 * 1000;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_DISK_HEADROOM_BYTES = 512 * 1024 * 1024;
const STALE_DIRECTORY_AGE_MS = 24 * 60 * 60 * 1000;

interface SourceAsset {
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  status: string;
  storageKey: string;
  track: string;
}

interface TranscriptionSource {
  assets: SourceAsset[];
  id: string;
  manifestSha256: string;
  organizationId: string;
}

interface PrepareChunkSource {
  durationMs: number;
  filePath: string;
  track: "microphone" | "system";
}

export interface MeetingTranscriptionDependencies {
  claim: typeof claimMeetingTranscriptionRun;
  claimChunk: typeof claimMeetingTranscriptionChunk;
  createRunId: () => string;
  createWorkingDirectory: () => Promise<string>;
  downloadSource: typeof downloadMeetingRecordingObjectToFile;
  ensureDiskCapacity: (input: { directory: string; requiredBytes: number }) => Promise<void>;
  loadSource: (
    input: MeetingTranscriptionJobData,
  ) => Promise<TranscriptionSource | null | undefined>;
  markFailed: typeof markMeetingTranscriptionFailed;
  markChunkFailed: typeof markMeetingTranscriptionChunkFailed;
  prepareChunks: (input: {
    directory: string;
    sources: PrepareChunkSource[];
  }) => Promise<FinalTranscriptionAudioChunk[]>;
  provider: MeetingTranscriptionProvider;
  publish: typeof publishMeetingTranscript;
  requestIntelligence: typeof requestAutomaticMeetingIntelligence;
  removeWorkingDirectory: (directory: string) => Promise<void>;
  saveChunkCheckpoint: (
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
    transcript: CanonicalMeetingTranscript,
  ) => Promise<CanonicalMeetingTranscript>;
  withMediaPermit: <Result>(
    requiredBytes: number,
    task: (reservedBytes: number) => Promise<Result>,
  ) => Promise<Result>;
}

function positiveEnvInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createMediaPermitPool(concurrency: number) {
  let active = 0;
  let reservedBytes = 0;
  const waiting: (() => void)[] = [];
  const acquire = async () => {
    if (active < concurrency) {
      active += 1;
      return;
    }
    const permit = Promise.withResolvers<boolean>();
    waiting.push(() => permit.resolve(true));
    await permit.promise;
    active += 1;
  };
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async <Result>(
    requiredBytes: number,
    task: (totalReservedBytes: number) => Promise<Result>,
  ): Promise<Result> => {
    await acquire();
    reservedBytes += requiredBytes;
    try {
      return await task(reservedBytes);
    } finally {
      reservedBytes -= requiredBytes;
      release();
    }
  };
}

const withMediaPermit = createMediaPermitPool(
  positiveEnvInteger("MEETING_TRANSCRIPTION_MEDIA_CONCURRENCY", 2),
);

async function prepareAudioChunks(input: {
  directory: string;
  sources: PrepareChunkSource[];
}): Promise<FinalTranscriptionAudioChunk[]> {
  const chunks: FinalTranscriptionAudioChunk[] = [];
  for (const source of input.sources) {
    const outputPattern = join(input.directory, `${source.track}-%03d.webm`);
    await execFileAsync(
      process.env.FFMPEG_BIN?.trim() || "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-i",
        source.filePath,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-f",
        "segment",
        "-segment_time",
        String(CHUNK_DURATION_MS / 1000),
        "-reset_timestamps",
        "1",
        outputPattern,
      ],
      {
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
        timeout: positiveEnvInteger("MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS", 30 * 60 * 1000),
      },
    );
    const directoryEntries = await readdir(input.directory);
    const names = directoryEntries
      .filter((name) => name.startsWith(`${source.track}-`) && name.endsWith(".webm"))
      .toSorted();
    for (const [index, name] of names.entries()) {
      const startMs = index * CHUNK_DURATION_MS;
      chunks.push({
        contentType: "audio/webm",
        endMs: Math.min(source.durationMs, startMs + CHUNK_DURATION_MS),
        filePath: join(input.directory, name),
        index,
        startMs,
        track: source.track,
      });
    }
  }
  return chunks;
}

const defaultDependencies: MeetingTranscriptionDependencies = {
  claim: claimMeetingTranscriptionRun,
  claimChunk: claimMeetingTranscriptionChunk,
  createRunId: randomUUID,
  createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-transcription-")),
  downloadSource: downloadMeetingRecordingObjectToFile,
  ensureDiskCapacity: async ({ directory, requiredBytes }) => {
    const filesystem = await statfs(directory);
    const availableBytes = filesystem.bavail * filesystem.bsize;
    if (availableBytes < requiredBytes + MIN_DISK_HEADROOM_BYTES) {
      throw new Error("Meeting transcription 工作目录可用空间不足");
    }
  },
  loadSource: loadMeetingTranscriptionSource,
  markChunkFailed: markMeetingTranscriptionChunkFailed,
  markFailed: markMeetingTranscriptionFailed,
  prepareChunks: prepareAudioChunks,
  provider: createOpenAiMeetingTranscriptionProvider({
    apiKey: process.env.OPENAI_API_KEY?.trim() || "",
    baseUrl: process.env.OPENAI_BASE_URL?.trim(),
  }),
  publish: publishMeetingTranscript,
  removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
  requestIntelligence: requestAutomaticMeetingIntelligence,
  saveChunkCheckpoint: saveMeetingTranscriptionChunkCheckpoint,
  withMediaPermit,
};

function mergeChunkTranscripts(
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

export function assertMeetingTranscriptionFfmpegVersion(
  versionLine: string,
  expected?: string,
): void {
  const expectedPrefix = expected?.trim();
  if (!expectedPrefix) {
    throw new Error("MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX is required");
  }
  if (!versionLine.startsWith(expectedPrefix)) {
    throw new Error(`FFmpeg version mismatch; expected prefix ${expectedPrefix}`);
  }
}

export async function validateMeetingTranscriptionRuntime(): Promise<void> {
  const { stdout } = await execFileAsync(process.env.FFMPEG_BIN?.trim() || "ffmpeg", ["-version"], {
    timeout: 10_000,
  });
  const versionLine = stdout.split("\n")[0] ?? "";
  assertMeetingTranscriptionFfmpegVersion(
    versionLine,
    process.env.MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX,
  );
  console.info("[meeting-transcription-worker] ffmpeg runtime", { version: versionLine });
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

async function transcribeChunk(input: {
  chunk: FinalTranscriptionAudioChunk;
  dependencies: MeetingTranscriptionDependencies;
  job: MeetingTranscriptionJobData;
  processingRunId: string;
}): Promise<CanonicalMeetingTranscript | null> {
  const chunkClaim = await input.dependencies.claimChunk(
    { ...input.job, processingRunId: input.processingRunId },
    input.chunk,
  );
  if (chunkClaim.status === "not-current") {
    return null;
  }
  if (chunkClaim.status === "busy") {
    throw new Error("Meeting transcription chunk is already processing");
  }
  if (chunkClaim.status === "ready") {
    return chunkClaim.transcript;
  }
  let providerResult: CanonicalMeetingTranscript;
  try {
    providerResult = await input.dependencies.provider.transcribeFinal({
      chunks: [input.chunk],
      languageHint: null,
      model: input.job.model,
      region: input.job.region,
    });
  } catch (error) {
    try {
      await input.dependencies.markChunkFailed(
        { ...input.job, processingRunId: input.processingRunId },
        input.chunk,
      );
    } catch (markChunkFailedError) {
      console.error("[meeting-transcription-worker] failed to release provider-failed chunk", {
        errorName:
          markChunkFailedError instanceof Error ? markChunkFailedError.name : "UnknownError",
        meetingId: input.job.meetingId,
        processingRunId: input.processingRunId,
      });
    }
    throw error;
  }
  return await input.dependencies.saveChunkCheckpoint(
    { ...input.job, processingRunId: input.processingRunId },
    input.chunk,
    providerResult,
  );
}

async function requestAutomaticIntelligenceBestEffort(input: {
  dependencies: MeetingTranscriptionDependencies;
  meetingId: string;
  organizationId: string;
}): Promise<void> {
  try {
    await input.dependencies.requestIntelligence({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  } catch (error) {
    console.error("[meeting-transcription-worker] failed to request Meeting Intelligence", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

// oxlint-disable-next-line complexity -- source admission, checkpoint recovery, and failure persistence form one job boundary.
export async function runMeetingTranscriptionProcessing(
  input: MeetingTranscriptionJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingTranscriptionDependencies = defaultDependencies,
): Promise<void> {
  const meeting = await dependencies.loadSource(input);
  if (!meeting) {
    throw new Error("Meeting Session 不存在");
  }
  const processingRunId = dependencies.createRunId();
  const claim = await dependencies.claim({
    ...input,
    attempt: context.attempt,
    processingRunId,
  });
  if (claim === "already-ready") {
    await requestAutomaticIntelligenceBestEffort({
      dependencies,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
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
    const prepared = await dependencies.withMediaPermit(sourceBytes * 2, async (reservedBytes) => {
      const directory = await dependencies.createWorkingDirectory();
      workingDirectory = directory;
      await dependencies.ensureDiskCapacity({ directory, requiredBytes: reservedBytes });
      const microphonePath = join(directory, "microphone-source.webm");
      const systemPath = join(directory, "system-source.webm");
      await Promise.all([
        dependencies.downloadSource({
          filePath: microphonePath,
          storageKey: microphone.storageKey,
        }),
        dependencies.downloadSource({ filePath: systemPath, storageKey: system.storageKey }),
      ]);
      const chunks = await dependencies.prepareChunks({
        directory,
        sources: [
          { durationMs: microphone.durationMs, filePath: microphonePath, track: "microphone" },
          { durationMs: system.durationMs, filePath: systemPath, track: "system" },
        ],
      });
      return { chunks };
    });
    const chunkResults: {
      chunk: FinalTranscriptionAudioChunk;
      transcript: CanonicalMeetingTranscript;
    }[] = [];
    for (const chunk of prepared.chunks) {
      const transcript = await transcribeChunk({
        chunk,
        dependencies,
        job: input,
        processingRunId,
      });
      if (!transcript) {
        return;
      }
      chunkResults.push({ chunk, transcript });
    }
    const transcript = mergeChunkTranscripts(chunkResults);
    const published = await dependencies.publish({ ...input, processingRunId, transcript });
    if (published) {
      await requestAutomaticIntelligenceBestEffort({
        dependencies,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Meeting transcription processing failed";
    try {
      await dependencies.markFailed({
        ...input,
        errorCode: error instanceof MeetingProviderQuotaError ? "provider-quota" : "provider-error",
        errorMessage,
        processingRunId,
        terminal: context.attempt >= context.maxAttempts,
      });
    } catch (markFailedError) {
      console.error("[meeting-transcription-worker] failed to persist processing failure", {
        errorName: markFailedError instanceof Error ? markFailedError.name : "UnknownError",
        meetingId: input.meetingId,
        processingRunId,
      });
    }
    throw error;
  } finally {
    if (workingDirectory) {
      await dependencies.removeWorkingDirectory(workingDirectory);
    }
  }
}
