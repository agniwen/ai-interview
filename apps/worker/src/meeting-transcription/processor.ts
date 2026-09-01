import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { downloadMeetingRecordingObjectToFile } from "@app/object-storage";
import {
  assertMeetingTranscriptionFfmpegAvailable,
  mergeMeetingTranscriptionChunkResults,
  prepareMeetingTranscriptionAudioChunks,
  readMeetingTranscriptionFfmpegVersion,
} from "@app/meeting-media";
import type { FinalTranscriptionAudioChunk } from "@app/meeting-media";
import type {
  claimMeetingTranscriptionChunk,
  claimMeetingTranscriptionRun,
  MeetingTranscriptionProvider,
  markMeetingTranscriptionChunkFailed,
  markMeetingTranscriptionFailed,
  publishMeetingTranscript,
} from "@app/server/worker/meeting-transcription";
import {
  assertMeetingTranscriptionJobEndpoint,
  createQwenAsrMeetingTranscriptionProvider,
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
  resolveMeetingTranscriptionQwenBaseUrl,
} from "@app/server/worker/meeting-transcription";
import { createQwenAsrAudioUrlDependencies } from "./qwen-asr-r2";
import type { requestAutomaticMeetingIntelligence } from "@app/server/worker/meeting-intelligence";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";
import pLimit from "p-limit";

export {
  assertMeetingTranscriptionFfmpegAvailable,
  assertMeetingTranscriptionFfmpegVersion,
} from "@app/meeting-media";

const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MIN_DISK_HEADROOM_BYTES = 512 * 1024 * 1024;
const STALE_DIRECTORY_AGE_MS = 24 * 60 * 60 * 1000;

interface SourceAsset {
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
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
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
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
  providerForJob?: (input: MeetingTranscriptionJobData) => MeetingTranscriptionProvider;
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

export function createMeetingTranscriptionProviderForJob(
  job: MeetingTranscriptionJobData,
  env: NodeJS.ProcessEnv = process.env,
): MeetingTranscriptionProvider {
  if (job.provider !== "qwen") {
    throw new Error(`Meeting transcription provider ${job.provider} is not supported`);
  }
  const baseUrl = assertMeetingTranscriptionJobEndpoint({
    baseUrl: resolveMeetingTranscriptionQwenBaseUrl(env),
    provider: "qwen",
    region: job.region,
  });
  const { createAudioUrl, deleteAudioUrl } = createQwenAsrAudioUrlDependencies({
    env,
    meetingId: job.meetingId,
    organizationId: job.organizationId,
    stagingToken: randomUUID(),
  });
  return createQwenAsrMeetingTranscriptionProvider({
    apiKey: env.ALIBABA_API_KEY?.trim() || "",
    baseUrl,
    createAudioUrl,
    deleteAudioUrl,
    model: env.MEETING_TRANSCRIPTION_QWEN_MODEL?.trim() || "qwen3-asr-flash-filetrans",
  });
}

type MeetingTranscriptionRuntimeAdapters = Pick<
  MeetingTranscriptionDependencies,
  | "claim"
  | "claimChunk"
  | "downloadSource"
  | "loadSource"
  | "markChunkFailed"
  | "markFailed"
  | "publish"
  | "requestIntelligence"
  | "saveChunkCheckpoint"
>;

export function createDefaultMeetingTranscriptionDependencies(
  adapters: MeetingTranscriptionRuntimeAdapters,
): MeetingTranscriptionDependencies {
  return {
    ...adapters,
    createRunId: randomUUID,
    createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-transcription-")),
    ensureDiskCapacity: async ({ directory, requiredBytes }) => {
      const filesystem = await statfs(directory);
      const availableBytes = filesystem.bavail * filesystem.bsize;
      if (availableBytes < requiredBytes + MIN_DISK_HEADROOM_BYTES) {
        throw new Error("Meeting transcription 工作目录可用空间不足");
      }
    },
    prepareChunks: (input) =>
      prepareMeetingTranscriptionAudioChunks({
        ...input,
        ffmpegBin: process.env.FFMPEG_BIN,
        ffmpegTimeoutMs: positiveEnvInteger(
          "MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS",
          30 * 60 * 1000,
        ),
      }),
    provider: {
      transcribeFinal: () => {
        throw new Error("最终转录必须使用任务绑定的通义千问 ASR");
      },
    },
    providerForJob: createMeetingTranscriptionProviderForJob,
    removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
    withMediaPermit,
  };
}

export async function validateMeetingTranscriptionRuntime(): Promise<void> {
  const versionLine = await readMeetingTranscriptionFfmpegVersion(process.env.FFMPEG_BIN);
  assertMeetingTranscriptionFfmpegAvailable(versionLine);
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
          return true;
        }
        return false;
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
    const provider = input.dependencies.providerForJob?.(input.job) ?? input.dependencies.provider;
    providerResult = await provider.transcribeFinal({
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
  dependencies: MeetingTranscriptionDependencies,
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
    const transcript = mergeMeetingTranscriptionChunkResults(chunkResults);
    const published = await dependencies.publish({
      ...input,
      processingRunId,
      transcript,
    });
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
        terminal:
          error instanceof MeetingProviderResponseError || context.attempt >= context.maxAttempts,
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
