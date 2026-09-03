// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { downloadMeetingRecordingObjectToFile } from "@app/object-storage";
import {
  assertMeetingTranscriptionFfmpegAvailable,
  candidateExclusionRanges,
  isMixedMeetingRecordingSource,
  mergeMeetingTranscriptionChunkResults,
  prepareMeetingTranscriptionAudioChunks,
  readMeetingTranscriptionFfmpegVersion,
} from "@app/meeting-media";
import type { FinalTranscriptionAudioChunk } from "@app/meeting-media";
import type {
  createMeetingTranscriptionDao,
  MeetingTranscriptionProvider,
} from "@app/meeting-processing/transcription";
import {
  assertMeetingTranscriptionJobEndpoint,
  createQwenAsrMeetingTranscriptionProvider,
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
  resolveMeetingTranscriptionQwenBaseUrl,
} from "@app/meeting-processing/transcription";
import { createQwenAsrAudioUrlDependencies } from "./qwen-asr-r2";
import type { createRequestAutomaticMeetingIntelligence } from "@app/meeting-processing/intelligence";
import type { createRequestAutomaticHumanInterviewEvaluation } from "@app/meeting-processing/human-interview";
import type { MeetingTranscriptionJobData } from "@app/meeting-processing-queue/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@app/shared/meeting-transcription";
import type {
  MeetingTranscriptionSourceTrack,
  RecordingIdentity,
} from "@app/shared/meeting-recording";
import pLimit from "p-limit";
import { Context, Data, Effect, Layer } from "effect";
import { retryTransientPromise } from "../effect/retry";
import { cleanupPreservingPrimary } from "../effect/cleanup";
import { settleAllOrThrow } from "../effect/parallel";
import { captureWorkerException } from "../sentry";

export {
  assertMeetingTranscriptionFfmpegAvailable,
  assertMeetingTranscriptionFfmpegVersion,
} from "@app/meeting-media";

// 超过 8 小时的任一音轨在下载前拒绝，避免超出最终转写资源预算。 / Rejects any track over eight hours before download to protect the final-transcription resource budget.
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
// 单轨超过 2 GiB 在下载前拒绝，限制临时磁盘与 ffmpeg 输入规模。 / Rejects a track over 2 GiB before download to bound temp disk and ffmpeg input size.
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
// 双轨合计也不得超过 2 GiB，避免两条合法单轨叠加突破作业预算。 / Also caps both tracks at 2 GiB combined so individually valid inputs cannot exceed the job budget together.
const MAX_TOTAL_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
// 除预留媒体空间外额外保留 512 MiB，避免并发作业耗尽宿主磁盘。 / Keeps 512 MiB beyond reserved media space so concurrent jobs do not exhaust the host disk.
const MIN_DISK_HEADROOM_BYTES = 512 * 1024 * 1024;
// 启动恢复可删除 24 小时前遗留目录，同时避免触碰仍可能运行的近期作业。 / Recovery may delete temp directories older than 24 hours while leaving potentially active recent jobs untouched.
const STALE_DIRECTORY_AGE_MS = 24 * 60 * 60 * 1000;

interface SourceAsset {
  recordingIdentity?: RecordingIdentity | null;
  contentType: string;
  durationMs: number;
  sizeBytes: number;
  speakerDisplayName?: string | null;
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
  recordingIdentity?: RecordingIdentity;
  durationMs: number;
  filePath: string;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  speakerDisplayName?: string;
  track: MeetingTranscriptionSourceTrack;
}

function parseMeetingTranscriptionSourceTrack(track: string): MeetingTranscriptionSourceTrack {
  if (/^participant-[a-zA-Z0-9-]+$/.test(track)) {
    // SAFETY: the anchored pattern establishes the participant source-track contract.
    return track as `participant-${string}`;
  }
  if (track === "microphone" || track === "mixed" || track === "system" || track === "candidate") {
    return track;
  }
  throw new Error(`Unsupported Meeting Recording track: ${track}`);
}

export interface MeetingTranscriptionDependencies {
  claim: ReturnType<typeof createMeetingTranscriptionDao>["claimMeetingTranscriptionRun"];
  claimChunk: ReturnType<typeof createMeetingTranscriptionDao>["claimMeetingTranscriptionChunk"];
  createRunId: () => string;
  createWorkingDirectory: () => Promise<string>;
  downloadSource: typeof downloadMeetingRecordingObjectToFile;
  ensureDiskCapacity: (input: { directory: string; requiredBytes: number }) => Promise<void>;
  loadSource: (
    input: MeetingTranscriptionJobData,
  ) => Promise<TranscriptionSource | null | undefined>;
  markFailed: ReturnType<typeof createMeetingTranscriptionDao>["markMeetingTranscriptionFailed"];
  markChunkFailed: ReturnType<
    typeof createMeetingTranscriptionDao
  >["markMeetingTranscriptionChunkFailed"];
  prepareChunks: (input: {
    directory: string;
    sources: PrepareChunkSource[];
  }) => Promise<FinalTranscriptionAudioChunk[]>;
  provider: MeetingTranscriptionProvider;
  providerForJob?: (input: MeetingTranscriptionJobData) => MeetingTranscriptionProvider;
  publish: ReturnType<typeof createMeetingTranscriptionDao>["publishMeetingTranscript"];
  requestIntelligence: ReturnType<typeof createRequestAutomaticMeetingIntelligence>;
  requestHumanEvaluation: ReturnType<typeof createRequestAutomaticHumanInterviewEvaluation>;
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

export class MeetingTranscriptionProcessor extends Context.Service<
  MeetingTranscriptionProcessor,
  MeetingTranscriptionDependencies
>()("@app/worker/MeetingTranscriptionProcessor") {}

export const meetingTranscriptionProcessorLayer = (
  dependencies: MeetingTranscriptionDependencies,
) => Layer.succeed(MeetingTranscriptionProcessor, dependencies);

class MeetingTranscriptionFailure extends Data.TaggedError("MeetingTranscriptionFailure")<{
  readonly cause: unknown;
}> {}

function positiveEnvInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// 将媒体作业限制在固定并发内，并把当前所有作业的预留字节传给磁盘准入检查。 / Limits media jobs to fixed concurrency and passes total reserved bytes to disk admission checks.
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

// 所有最终转写共享同一许可池，默认并发 2，可由环境变量调整。 / All final transcriptions share one permit pool, defaulting to concurrency two with an environment override.
const withMediaPermit = createMediaPermitPool(
  positiveEnvInteger("MEETING_TRANSCRIPTION_MEDIA_CONCURRENCY", 2),
);

// 校验任务区域端点并为每个任务创建独立 R2 staging token，避免跨任务复用临时 URL。 / Validates the job's regional endpoint and creates a per-job R2 staging token so temporary URLs are never shared across jobs.
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
    model: job.model,
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
  | "requestHumanEvaluation"
  | "saveChunkCheckpoint"
>;

// 在持久化适配器外补齐临时目录、磁盘准入、ffmpeg 分片、供应商选择和媒体许可池。 / Adds temp directories, disk admission, ffmpeg chunking, provider selection, and media permits around persistence adapters.
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

// Worker 启动时读取并校验 ffmpeg 版本，缺失二进制时在消费任务前快速失败。 / Reads and validates ffmpeg at Worker startup so a missing binary fails before jobs are consumed.
export async function validateMeetingTranscriptionRuntime(): Promise<void> {
  const versionLine = await readMeetingTranscriptionFfmpegVersion(process.env.FFMPEG_BIN);
  assertMeetingTranscriptionFfmpegAvailable(versionLine);
  console.info("[meeting-transcription-worker] ffmpeg runtime", { version: versionLine });
}

// 仅清理匹配专用前缀且超过阈值的目录，避免广泛删除系统临时文件。 / Removes only directories with the dedicated prefix and stale age, avoiding broad deletion in the system temp root.
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

// 分片级租约支持跳过已完成结果；供应商失败先释放分片，成功则持久化 checkpoint 供重试复用。 / A chunk lease reuses completed results; provider failures release the chunk, while success persists a checkpoint for retries.
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

// 转录已发布后触发智能分析，但隔离入队失败，避免把已完成转录回滚为失败。 / Requests intelligence after publication while isolating enqueue failures so a completed transcript is not reclassified as failed.
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

// 固定源清单后执行资源准入、双轨下载、可恢复分片转写与 CAS 发布，并按供应商错误决定重试终止性。 / Pins the source manifest, performs resource admission, dual-track download, resumable chunk transcription, and CAS publication, then classifies provider errors for retry terminality.
async function requestHumanInterviewEvaluationBestEffort(input: {
  dependencies: MeetingTranscriptionDependencies;
  meetingId: string;
  organizationId: string;
}): Promise<void> {
  try {
    await input.dependencies.requestHumanEvaluation({
      meetingSessionId: input.meetingId,
      organizationId: input.organizationId,
    });
  } catch (error) {
    console.error("[meeting-transcription-worker] failed to request human interview evaluation", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      meetingId: input.meetingId,
    });
  }
}

// oxlint-disable-next-line complexity -- source admission, checkpoint recovery, and failure persistence form one job boundary.
async function runMeetingTranscriptionProcessingPromise(
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
    await requestHumanInterviewEvaluationBestEffort({
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
  let primaryCause: unknown;
  let hasPrimaryFailure = false;
  try {
    if (meeting.manifestSha256 !== input.sourceManifestSha256) {
      throw new Error("Meeting Recording 清单已变化");
    }
    const mixed = meeting.assets.find((asset) => asset.track === "mixed");
    const candidate = meeting.assets.find((asset) => asset.track === "candidate");
    const microphone = meeting.assets.find((asset) => asset.track === "microphone");
    const system = meeting.assets.find((asset) => asset.track === "system");
    const identityRecording = meeting.assets.some((asset) => asset.recordingIdentity);
    const roomMixes = meeting.assets.filter(isMixedMeetingRecordingSource);
    let sources = mixed?.status === "ready" ? [mixed] : [];
    if (identityRecording) {
      sources = meeting.assets.filter(
        (asset) =>
          asset.status === "ready" &&
          (asset.track === "mixed" || asset.track.startsWith("participant-")),
      );
    }
    if (!identityRecording && sources.length > 0 && candidate?.status === "ready") {
      sources.push(candidate);
    }
    if (sources.length === 0 && microphone?.status === "ready" && system?.status === "ready") {
      sources.push(microphone, system);
    }
    if (sources.length === 0) {
      throw new Error("Meeting Recording 源音轨尚未完整验证");
    }
    const sourceBytes = sources.reduce((total, source) => total + source.sizeBytes, 0);
    if (
      sources.some(
        (source) => source.sizeBytes > MAX_SOURCE_BYTES || source.durationMs > MAX_DURATION_MS,
      ) ||
      sourceBytes > MAX_TOTAL_SOURCE_BYTES ||
      sourceBytes <= 0
    ) {
      throw new Error("Meeting Recording 超出最终转录的资源预算");
    }
    const failedRanges: { startMs: number; endMs: number }[] = [];
    const prepared = await dependencies.withMediaPermit(sourceBytes * 2, async (reservedBytes) => {
      const directory = await dependencies.createWorkingDirectory();
      workingDirectory = directory;
      await dependencies.ensureDiskCapacity({ directory, requiredBytes: reservedBytes });
      const preparedSources = sources.map((source) => ({
        durationMs: source.durationMs,
        filePath: join(directory, `${source.track}-source.media`),
        recordingIdentity: source.recordingIdentity ?? undefined,
        segments: source.segments,
        speakerDisplayName: source.speakerDisplayName ?? undefined,
        storageKey: source.storageKey,
        track: parseMeetingTranscriptionSourceTrack(source.track),
      }));
      const downloaded = await settleAllOrThrow(
        preparedSources.map(async (source) => {
          try {
            await retryTransientPromise(() =>
              dependencies.downloadSource({
                filePath: source.filePath,
                storageKey: source.storageKey,
              }),
            );
            return source;
          } catch (error) {
            if (!identityRecording || context.attempt < context.maxAttempts) {
              throw error;
            }
            failedRanges.push({
              endMs: (source.recordingIdentity?.offsetMs ?? 0) + source.durationMs,
              startMs: source.recordingIdentity?.offsetMs ?? 0,
            });
            return null;
          }
        }),
      );
      const available = downloaded.filter((source) => source !== null);
      const chunkSources = available.map((source) => ({
        durationMs: source.durationMs,
        filePath: source.filePath,
        recordingIdentity: source.recordingIdentity,
        segments: source.segments,
        speakerDisplayName: source.speakerDisplayName,
        track: source.track,
      }));
      if (identityRecording) {
        const chunks: FinalTranscriptionAudioChunk[] = [];
        for (const source of chunkSources) {
          try {
            chunks.push(...(await dependencies.prepareChunks({ directory, sources: [source] })));
          } catch (error) {
            if (context.attempt < context.maxAttempts) {
              throw error;
            }
            failedRanges.push({
              endMs: (source.recordingIdentity?.offsetMs ?? 0) + source.durationMs,
              startMs: source.recordingIdentity?.offsetMs ?? 0,
            });
          }
        }
        return { chunks };
      }
      const chunks = await dependencies.prepareChunks({
        directory,
        sources: chunkSources,
      });
      return { chunks };
    });
    const chunkResults: {
      chunk: FinalTranscriptionAudioChunk;
      transcript: CanonicalMeetingTranscript;
    }[] = [];
    const primaryChunks = identityRecording
      ? prepared.chunks.filter((chunk) => !isMixedMeetingRecordingSource(chunk))
      : prepared.chunks;
    for (const chunk of primaryChunks) {
      try {
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
      } catch (error) {
        if (!identityRecording || context.attempt < context.maxAttempts) {
          throw error;
        }
        failedRanges.push({ endMs: chunk.endMs, startMs: chunk.startMs });
      }
    }
    if (identityRecording) {
      const ranges = [
        ...roomMixes.flatMap((source) => source.recordingIdentity?.recoveryRanges ?? []),
        ...failedRanges,
      ];
      if (primaryChunks.length === 0) {
        ranges.push({ endMs: MAX_DURATION_MS, startMs: 0 });
      }
      for (const chunk of prepared.chunks.filter(isMixedMeetingRecordingSource)) {
        if (!ranges.some((range) => range.startMs < chunk.endMs && range.endMs > chunk.startMs)) {
          continue;
        }
        try {
          const recovered = await transcribeChunk({
            chunk,
            dependencies,
            job: input,
            processingRunId,
          });
          if (!recovered) {
            return;
          }
          chunkResults.push({
            chunk,
            transcript: {
              ...recovered,
              turns: recovered.turns.filter((turn) =>
                ranges.some((range) => turn.startMs < range.endMs && turn.endMs > range.startMs),
              ),
            },
          });
        } catch (error) {
          if (context.attempt < context.maxAttempts || chunkResults.length === 0) {
            throw error;
          }
        }
      }
      if (chunkResults.length === 0) {
        throw new Error("录音转录与全场补救均失败，可手动提交评价");
      }
    }
    const exclusions = candidateExclusionRanges(
      sources.flatMap((source) =>
        source.recordingIdentity?.role === "candidate"
          ? [
              {
                endMs: source.recordingIdentity.offsetMs + source.durationMs,
                silenceRanges: source.recordingIdentity.silenceRanges ?? [],
                sourceId: source.recordingIdentity.sourceId,
                startMs: source.recordingIdentity.offsetMs,
              },
            ]
          : [],
      ),
    );
    const transcript = mergeMeetingTranscriptionChunkResults(chunkResults, exclusions);
    let warning: string | undefined;
    if (
      identityRecording &&
      (failedRanges.length > 0 ||
        roomMixes.some((source) => source.recordingIdentity?.recoveryRanges?.length) ||
        transcript.turns.some((turn) => turn.attribution?.role === "unknown"))
    ) {
      warning =
        "部分录音或转录存在缺失，已保留可用内容并尝试全场录音补救；待确认发言不作为候选人能力证据。";
    }
    const published = await dependencies.publish({
      ...input,
      processingRunId,
      transcript,
      warning,
    });
    if (published) {
      await requestAutomaticIntelligenceBestEffort({
        dependencies,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
      await requestHumanInterviewEvaluationBestEffort({
        dependencies,
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    }
  } catch (error) {
    primaryCause = error;
    hasPrimaryFailure = true;
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
      const directory = workingDirectory;
      await cleanupPreservingPrimary({
        cleanup: () => dependencies.removeWorkingDirectory(directory),
        hasPrimaryFailure,
        onCleanupFailure: (error) => {
          captureWorkerException(error, "worker.meeting-transcription.cleanup", {
            meetingId: input.meetingId,
            processingRunId,
          });
          console.error("[meeting-transcription-worker] failed to remove working directory", {
            errorName: error instanceof Error ? error.name : "UnknownError",
            meetingId: input.meetingId,
            processingRunId,
          });
        },
        primaryCause,
      });
    }
  }
}

export function runMeetingTranscriptionProcessingEffect(
  input: MeetingTranscriptionJobData,
  context: { attempt: number; maxAttempts: number },
) {
  return Effect.gen(function* () {
    const dependencies = yield* MeetingTranscriptionProcessor;
    yield* Effect.tryPromise({
      catch: (cause) => new MeetingTranscriptionFailure({ cause }),
      try: () => runMeetingTranscriptionProcessingPromise(input, context, dependencies),
    });
  });
}

export async function runMeetingTranscriptionProcessing(
  input: MeetingTranscriptionJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: MeetingTranscriptionDependencies,
): Promise<void> {
  await Effect.runPromise(
    runMeetingTranscriptionProcessingEffect(input, context).pipe(
      Effect.provide(meetingTranscriptionProcessorLayer(dependencies)),
      Effect.catchTag("MeetingTranscriptionFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
