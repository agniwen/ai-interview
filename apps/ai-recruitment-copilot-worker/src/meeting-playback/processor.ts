import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildMeetingPlaybackAssetKey,
  deleteMeetingRecordingObject,
  downloadMeetingRecordingObjectToFile,
  headMeetingRecordingObject,
  putMeetingRecordingFile,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  loadMeetingPlaybackSource,
  markMeetingPlaybackFailed,
  markMeetingPlaybackProcessing,
  publishMeetingPlaybackAsset,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/dao";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";

interface PlaybackSourceAsset {
  contentType: string;
  durationMs: number;
  status: string;
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

export interface MeetingPlaybackDependencies {
  buildPlaybackStorageKey: typeof buildMeetingPlaybackAssetKey;
  createRunId: () => string;
  createWorkingDirectory: () => Promise<string>;
  deletePlayback: typeof deleteMeetingRecordingObject;
  downloadSource: typeof downloadMeetingRecordingObjectToFile;
  inspectOutput: (filePath: string) => Promise<{ sha256: string; sizeBytes: number }>;
  loadSource: (input: MeetingPlaybackJobData) => Promise<PlaybackSource | null | undefined>;
  markFailed: typeof markMeetingPlaybackFailed;
  markProcessing: typeof markMeetingPlaybackProcessing;
  mixSources: (input: {
    microphonePath: string;
    outputPath: string;
    systemPath: string;
  }) => Promise<void>;
  publishPlayback: typeof publishMeetingPlaybackAsset;
  removeWorkingDirectory: (directory: string) => Promise<void>;
  uploadPlayback: typeof putMeetingRecordingFile;
  verifyPlayback: (input: {
    contentType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }) => Promise<boolean>;
}

async function inspectFile(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  const details = await stat(filePath);
  return { sha256: hash.digest("hex"), sizeBytes: details.size };
}

async function runFfmpeg(input: {
  microphonePath: string;
  outputPath: string;
  systemPath: string;
}): Promise<void> {
  await execFileAsync(
    process.env.FFMPEG_BIN?.trim() || "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-i",
      input.microphonePath,
      "-i",
      input.systemPath,
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

const defaultDependencies: MeetingPlaybackDependencies = {
  buildPlaybackStorageKey: buildMeetingPlaybackAssetKey,
  createRunId: randomUUID,
  createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-playback-")),
  deletePlayback: deleteMeetingRecordingObject,
  downloadSource: downloadMeetingRecordingObjectToFile,
  inspectOutput: inspectFile,
  loadSource: loadMeetingPlaybackSource,
  markFailed: markMeetingPlaybackFailed,
  markProcessing: markMeetingPlaybackProcessing,
  mixSources: runFfmpeg,
  publishPlayback: publishMeetingPlaybackAsset,
  removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
  uploadPlayback: putMeetingRecordingFile,
  verifyPlayback: async (input) => {
    const object = await headMeetingRecordingObject(input.storageKey);
    return Boolean(
      object &&
      object.contentLength === input.sizeBytes &&
      object.contentType === input.contentType &&
      object.sha256 === input.sha256,
    );
  },
};

export async function runMeetingPlaybackProcessing(
  input: MeetingPlaybackJobData,
  dependencies: MeetingPlaybackDependencies = defaultDependencies,
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
    await dependencies.mixSources({ microphonePath, outputPath, systemPath });
    const output = await dependencies.inspectOutput(outputPath);
    const storageKey = await dependencies.buildPlaybackStorageKey({ ...input, processingRunId });
    playbackStorageKey = storageKey;
    const contentType = "audio/webm";
    await dependencies.uploadPlayback({
      contentType,
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
    if (!published) {
      cleanupPlayback = true;
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Meeting playback processing failed";
    try {
      cleanupPlayback = await dependencies.markFailed({ ...input, errorMessage, processingRunId });
    } catch (markFailedError) {
      console.error("[meeting-playback-worker] failed to persist processing failure", {
        error: markFailedError,
        meetingId: input.meetingId,
        processingRunId,
      });
    }
    throw error;
  } finally {
    if (cleanupPlayback && playbackStorageKey) {
      try {
        await dependencies.deletePlayback(playbackStorageKey);
      } catch (error) {
        console.error("[meeting-playback-worker] failed to remove unpublished playback", {
          error,
          meetingId: input.meetingId,
          processingRunId,
          storageKey: playbackStorageKey,
        });
      }
    }
    if (workingDirectory) {
      await dependencies.removeWorkingDirectory(workingDirectory);
    }
  }
}
