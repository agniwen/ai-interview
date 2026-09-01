import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { normalizeMeetingRecordingSegments } from "@app/meeting-media";
import type {
  buildMeetingPlaybackAssetKey,
  deleteMeetingRecordingObject,
  downloadMeetingRecordingObjectToFile,
  putMeetingRecordingFile,
} from "@app/object-storage";
import type {
  markMeetingPlaybackFailed,
  markMeetingPlaybackProcessing,
  publishMeetingPlaybackAsset,
  registerMeetingPlaybackCleanupKey,
  removeMeetingPlaybackCleanupKey,
} from "./dao";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";

interface PlaybackSourceAsset {
  contentType: string;
  durationMs: number;
  status: string;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  storageKey: string;
  track: string;
}

interface PlaybackSource {
  assets: PlaybackSourceAsset[];
  id: string;
  organizationId: string;
  status: string;
}

const execFileAsync = promisify(execFile);

type ExecFileOutputKey = "stderr" | "stdout";
type ExecFileFailure = Error & Partial<Record<ExecFileOutputKey, string | Uint8Array>>;

function isExecFileFailure(error: Error): error is ExecFileFailure {
  return "stderr" in error || "stdout" in error;
}

function execFileStream(error: ExecFileFailure, key: ExecFileOutputKey): string {
  const value = error[key];
  return value === undefined ? "" : Buffer.from(value).toString().trim();
}

// 合并 ffmpeg stderr/stdout 并截断到数据库字段上限，使媒体失败仍保留可诊断信息。 / Combines ffmpeg stderr/stdout and truncates to the database limit so media failures remain diagnosable.
export function describeMeetingPlaybackError(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "Meeting playback processing failed";
  }
  const streams = isExecFileFailure(cause)
    ? [execFileStream(cause, "stderr"), execFileStream(cause, "stdout")]
    : [];
  const details = [cause.message, ...streams].filter(Boolean).join("\n");
  return details.slice(0, 1000);
}

export interface MeetingPlaybackDependencies {
  buildPlaybackStorageKey: typeof buildMeetingPlaybackAssetKey;
  createRunId: () => string;
  createWorkingDirectory: () => Promise<string>;
  deletePlayback: typeof deleteMeetingRecordingObject;
  downloadSource: typeof downloadMeetingRecordingObjectToFile;
  enqueueTranscription: (input: { meetingId: string; organizationId: string }) => Promise<void>;
  inspectOutput: (filePath: string) => Promise<{ sha256: string; sizeBytes: number }>;
  loadSource: (input: MeetingPlaybackJobData) => Promise<PlaybackSource | null | undefined>;
  markFailed: typeof markMeetingPlaybackFailed;
  markProcessing: typeof markMeetingPlaybackProcessing;
  mixSources: (input: {
    microphonePath: string;
    microphoneSegments?: PlaybackSourceAsset["segments"];
    outputPath: string;
    systemPath: string;
    systemSegments?: PlaybackSourceAsset["segments"];
  }) => Promise<void>;
  publishPlayback: typeof publishMeetingPlaybackAsset;
  registerCleanupKey: typeof registerMeetingPlaybackCleanupKey;
  removeCleanupKey: typeof removeMeetingPlaybackCleanupKey;
  removeWorkingDirectory: (directory: string) => Promise<void>;
  uploadPlayback: typeof putMeetingRecordingFile;
  verifyPlayback: (input: {
    contentType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }) => Promise<boolean>;
}

// 流式哈希混音文件，返回上传完整性校验与发布记录共用的元数据。 / Streams the mixed file hash and returns metadata shared by upload verification and publication.
async function inspectFile(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  const details = await stat(filePath);
  return { sha256: hash.digest("hex"), sizeBytes: details.size };
}

// 先按分片清单规范化两条轨道，再以最长轨为准混成 Opus WebM，保留完整会议时长。 / Normalizes both tracks from segment manifests, then mixes to Opus WebM using the longest track duration.
async function runFfmpeg(input: {
  microphonePath: string;
  microphoneSegments?: PlaybackSourceAsset["segments"];
  outputPath: string;
  systemPath: string;
  systemSegments?: PlaybackSourceAsset["segments"];
}): Promise<void> {
  const [microphonePath, systemPath] = await Promise.all([
    normalizeMeetingRecordingSegments({
      ffmpegBin: process.env.FFMPEG_BIN,
      outputPath: join(dirname(input.outputPath), "microphone-normalized.webm"),
      segments: input.microphoneSegments,
      sourcePath: input.microphonePath,
    }),
    normalizeMeetingRecordingSegments({
      ffmpegBin: process.env.FFMPEG_BIN,
      outputPath: join(dirname(input.outputPath), "system-normalized.webm"),
      segments: input.systemSegments,
      sourcePath: input.systemPath,
    }),
  ]);
  await execFileAsync(
    process.env.FFMPEG_BIN?.trim() || "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-i",
      microphonePath,
      "-i",
      systemPath,
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[a]",
      "-map",
      "[a]",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      "-f",
      "webm",
      input.outputPath,
    ],
    { maxBuffer: 4 * 1024 * 1024 },
  );
}

type MeetingPlaybackRuntimeAdapters = Pick<
  MeetingPlaybackDependencies,
  | "buildPlaybackStorageKey"
  | "deletePlayback"
  | "downloadSource"
  | "loadSource"
  | "markFailed"
  | "markProcessing"
  | "publishPlayback"
  | "registerCleanupKey"
  | "removeCleanupKey"
  | "uploadPlayback"
  | "verifyPlayback"
>;

// 在 DAO/存储适配器之外补齐临时目录、ffmpeg、哈希与下游转写入队等进程级能力。 / Adds process-level temp-directory, ffmpeg, hashing, and downstream transcription enqueue behavior around DAO/storage adapters.
export function createDefaultMeetingPlaybackDependencies(
  adapters: MeetingPlaybackRuntimeAdapters,
): MeetingPlaybackDependencies {
  return {
    ...adapters,
    createRunId: randomUUID,
    createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-playback-")),
    enqueueTranscription: async (input) => {
      const [{ getMeetingTranscriptionJobForMeeting }, { enqueueMeetingTranscriptionJobs }] =
        await Promise.all([
          import("@app/server/worker/meeting-transcription"),
          import("@arc/meeting-processing-queue/meeting-transcription"),
        ]);
      const job = await getMeetingTranscriptionJobForMeeting(input);
      if (job) {
        await enqueueMeetingTranscriptionJobs([job]);
      }
    },
    inspectOutput: inspectFile,
    mixSources: runFfmpeg,
    removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
  };
}

// 认领后下载双轨、混音、登记清理键、上传校验并 CAS 发布；未发布对象在 finally 回收。 / After claiming, downloads both tracks, mixes, registers cleanup, verifies upload, and CAS-publishes; unpublished objects are reclaimed in finally.
// oxlint-disable-next-line complexity -- claim, external upload, CAS publish, and loser cleanup form one job boundary.
export async function runMeetingPlaybackProcessing(
  input: MeetingPlaybackJobData,
  dependencies: MeetingPlaybackDependencies,
): Promise<void> {
  const meeting = await dependencies.loadSource(input);
  if (!meeting) {
    throw new Error("Meeting Session 不存在");
  }
  if (meeting.status === "ready") {
    return;
  }

  const processingRunId = dependencies.createRunId();
  let cleanupPlayback = false;
  let playbackStorageKey: string | null = null;
  let workingDirectory: string | null = null;
  try {
    const claimed = await dependencies.markProcessing({ ...input, processingRunId });
    if (!claimed) {
      return;
    }
    const microphone = meeting.assets.find((asset) => asset.track === "microphone");
    const system = meeting.assets.find((asset) => asset.track === "system");
    if (!(microphone?.status === "ready" && system?.status === "ready")) {
      throw new Error("Meeting Recording 源音轨尚未完整验证");
    }
    workingDirectory = await dependencies.createWorkingDirectory();
    const microphonePath = join(workingDirectory, "microphone.webm");
    const systemPath = join(workingDirectory, "system.webm");
    const outputPath = join(workingDirectory, "playback.webm");
    await Promise.all([
      dependencies.downloadSource({
        filePath: microphonePath,
        storageKey: microphone.storageKey,
      }),
      dependencies.downloadSource({ filePath: systemPath, storageKey: system.storageKey }),
    ]);
    await dependencies.mixSources({
      microphonePath,
      microphoneSegments: microphone.segments,
      outputPath,
      systemPath,
      systemSegments: system.segments,
    });
    const output = await dependencies.inspectOutput(outputPath);
    const storageKey = await dependencies.buildPlaybackStorageKey({ ...input, processingRunId });
    playbackStorageKey = storageKey;
    const cleanupRegistration = await dependencies.registerCleanupKey({
      ...input,
      processingRunId,
      storageKey,
    });
    if (!cleanupRegistration) {
      throw new Error("Meeting playback run 已被替换或会议正在清除");
    }
    if (cleanupRegistration.writerLeaseExpiresAt.getTime() <= Date.now()) {
      throw new Error("Meeting playback writer lease 已过期");
    }
    const contentType = "audio/webm";
    await dependencies.uploadPlayback({
      contentType,
      deadlineAt: cleanupRegistration.writerLeaseExpiresAt,
      filePath: outputPath,
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
      storageKey,
    });
    const verified = await dependencies.verifyPlayback({
      contentType,
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
      storageKey,
    });
    if (!verified) {
      throw new Error("Mixed playback asset 完整性校验失败");
    }
    const published = await dependencies.publishPlayback({
      contentType,
      durationMs: Math.max(microphone.durationMs, system.durationMs),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      processingRunId,
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
      storageKey,
    });
    if (published) {
      try {
        await dependencies.removeCleanupKey({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          storageKey,
        });
      } catch (error) {
        console.error("[meeting-playback-worker] failed to retire published cleanup key", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: input.meetingId,
          processingRunId,
        });
      }
      try {
        await dependencies.enqueueTranscription({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        });
      } catch (error) {
        console.error("[meeting-playback-worker] immediate transcription enqueue failed", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: input.meetingId,
        });
      }
    } else {
      cleanupPlayback = true;
    }
  } catch (error) {
    const errorMessage = describeMeetingPlaybackError(error);
    console.error("[meeting-playback-worker] processing failed", {
      errorMessage,
      meetingId: input.meetingId,
      processingRunId,
    });
    try {
      cleanupPlayback = await dependencies.markFailed({ ...input, errorMessage, processingRunId });
    } catch (markFailedError) {
      console.error("[meeting-playback-worker] failed to persist processing failure", {
        errorName: markFailedError instanceof Error ? markFailedError.name : "UnknownError",
        meetingId: input.meetingId,
        processingRunId,
      });
    }
    throw error;
  } finally {
    if (cleanupPlayback && playbackStorageKey) {
      try {
        await dependencies.deletePlayback(playbackStorageKey);
        await dependencies.removeCleanupKey({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          storageKey: playbackStorageKey,
        });
      } catch (error) {
        console.error("[meeting-playback-worker] failed to remove unpublished playback", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: input.meetingId,
          processingRunId,
        });
      }
    }
    if (workingDirectory) {
      await dependencies.removeWorkingDirectory(workingDirectory);
    }
  }
}
