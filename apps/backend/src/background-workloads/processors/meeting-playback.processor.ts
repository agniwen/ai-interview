import { rawBackendEnvironment } from "../../config/raw-backend-environment.js";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";

const execFileAsync = promisify(execFile);

export interface PlaybackSourceAsset {
  contentType: string;
  durationMs: number;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  status: string;
  storageKey: string;
  track: string;
}

export interface MeetingPlaybackSource {
  assets: PlaybackSourceAsset[];
  id: string;
  organizationId: string;
  status: string;
}

export interface MeetingPlaybackProcessorPorts {
  buildPlaybackStorageKey(
    input: MeetingPlaybackJobData & { processingRunId: string },
  ): Promise<string>;
  createRunId(): string;
  createWorkingDirectory(): Promise<string>;
  deletePlayback(storageKey: string): Promise<void>;
  downloadSource(input: { filePath: string; storageKey: string }): Promise<void>;
  enqueueTranscription(input: { meetingId: string; organizationId: string }): Promise<void>;
  inspectOutput(filePath: string): Promise<{ sha256: string; sizeBytes: number }>;
  loadSource(input: MeetingPlaybackJobData): Promise<MeetingPlaybackSource | null | undefined>;
  markFailed(
    input: MeetingPlaybackJobData & { errorMessage: string; processingRunId: string },
  ): Promise<boolean>;
  markProcessing(input: MeetingPlaybackJobData & { processingRunId: string }): Promise<boolean>;
  mixSources(input: {
    microphonePath: string;
    microphoneSegments?: PlaybackSourceAsset["segments"];
    outputPath: string;
    systemPath: string;
    systemSegments?: PlaybackSourceAsset["segments"];
  }): Promise<void>;
  publishPlayback(input: {
    contentType: string;
    durationMs: number;
    meetingId: string;
    organizationId: string;
    processingRunId: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<boolean>;
  registerCleanupKey(
    input: MeetingPlaybackJobData & { processingRunId: string; storageKey: string },
  ): Promise<{ writerLeaseExpiresAt: Date } | null>;
  removeCleanupKey(input: {
    meetingId: string;
    organizationId: string;
    storageKey: string;
  }): Promise<void>;
  removeWorkingDirectory(directory: string): Promise<void>;
  uploadPlayback(input: {
    contentType: string;
    deadlineAt: Date;
    filePath: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<void>;
  verifyPlayback(input: {
    contentType: string;
    sha256: string;
    sizeBytes: number;
    storageKey: string;
  }): Promise<boolean>;
}

type ExecFileFailure = Error & Partial<Record<"stderr" | "stdout", string | Uint8Array>>;

export function describeMeetingPlaybackError(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "Meeting playback processing failed";
  }
  // SAFETY: Exec failures add optional stdout/stderr fields to Error; both are checked before use.
  const failure = cause as ExecFileFailure;
  const details = [
    cause.message,
    failure.stderr === undefined ? "" : Buffer.from(failure.stderr).toString().trim(),
    failure.stdout === undefined ? "" : Buffer.from(failure.stdout).toString().trim(),
  ]
    .filter(Boolean)
    .join("\n");
  return details.slice(0, 1000);
}

async function normalizeSegments(input: {
  outputPath: string;
  segments?: PlaybackSourceAsset["segments"];
  sourcePath: string;
}): Promise<string> {
  if (!input.segments || input.segments.length <= 1) {
    return input.sourcePath;
  }
  const segmentPaths: string[] = [];
  for (const [index, segment] of input.segments.entries()) {
    const segmentPath = join(dirname(input.outputPath), `source-segment-${index}.webm`);
    await pipeline(
      createReadStream(input.sourcePath, {
        end: segment.offsetBytes + segment.sizeBytes - 1,
        start: segment.offsetBytes,
      }),
      createWriteStream(segmentPath, { mode: 0o600 }),
    );
    segmentPaths.push(segmentPath);
  }
  const concatPath = `${input.outputPath}.ffconcat`;
  await writeFile(
    concatPath,
    `ffconcat version 1.0\n${segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n")}\n`,
    { mode: 0o600 },
  );
  await execFileAsync(
    rawBackendEnvironment.FFMPEG_BIN?.trim() || "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-map",
      "0:a:0",
      "-c:a",
      "libopus",
      "-f",
      "webm",
      input.outputPath,
    ],
    { timeout: 30 * 60 * 1000 },
  );
  return input.outputPath;
}

async function mixSources(input: {
  microphonePath: string;
  microphoneSegments?: PlaybackSourceAsset["segments"];
  outputPath: string;
  systemPath: string;
  systemSegments?: PlaybackSourceAsset["segments"];
}): Promise<void> {
  const [microphonePath, systemPath] = await Promise.all([
    normalizeSegments({
      outputPath: join(dirname(input.outputPath), "microphone-normalized.webm"),
      segments: input.microphoneSegments,
      sourcePath: input.microphonePath,
    }),
    normalizeSegments({
      outputPath: join(dirname(input.outputPath), "system-normalized.webm"),
      segments: input.systemSegments,
      sourcePath: input.systemPath,
    }),
  ]);
  await execFileAsync(
    rawBackendEnvironment.FFMPEG_BIN?.trim() || "ffmpeg",
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

async function inspectOutput(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  const details = await stat(filePath);
  return { sha256: hash.digest("hex"), sizeBytes: details.size };
}

export type MeetingPlaybackExternalPorts = Omit<
  MeetingPlaybackProcessorPorts,
  | "createRunId"
  | "createWorkingDirectory"
  | "inspectOutput"
  | "mixSources"
  | "removeWorkingDirectory"
>;

export function createMeetingPlaybackProcessorPorts(
  external: MeetingPlaybackExternalPorts,
): MeetingPlaybackProcessorPorts {
  return {
    ...external,
    createRunId: randomUUID,
    createWorkingDirectory: () => mkdtemp(join(tmpdir(), "meeting-playback-")),
    inspectOutput,
    mixSources,
    removeWorkingDirectory: (directory) => rm(directory, { force: true, recursive: true }),
  };
}

// oxlint-disable-next-line complexity -- Claim, upload, CAS publish and loser cleanup are one atomic job boundary.
export async function processMeetingPlaybackWorkload(
  input: MeetingPlaybackJobData,
  ports: MeetingPlaybackProcessorPorts,
): Promise<void> {
  const meeting = await ports.loadSource(input);
  if (!meeting) {
    throw new Error("Meeting Session 不存在");
  }
  if (meeting.status === "ready") {
    return;
  }
  const processingRunId = ports.createRunId();
  let cleanupPlayback = false;
  let playbackStorageKey: string | null = null;
  let workingDirectory: string | null = null;
  try {
    if (!(await ports.markProcessing({ ...input, processingRunId }))) {
      return;
    }
    const microphone = meeting.assets.find((asset) => asset.track === "microphone");
    const system = meeting.assets.find((asset) => asset.track === "system");
    if (!(microphone?.status === "ready" && system?.status === "ready")) {
      throw new Error("Meeting Recording 源音轨尚未完整验证");
    }
    workingDirectory = await ports.createWorkingDirectory();
    const microphonePath = join(workingDirectory, "microphone.webm");
    const systemPath = join(workingDirectory, "system.webm");
    const outputPath = join(workingDirectory, "playback.webm");
    await Promise.all([
      ports.downloadSource({ filePath: microphonePath, storageKey: microphone.storageKey }),
      ports.downloadSource({ filePath: systemPath, storageKey: system.storageKey }),
    ]);
    await ports.mixSources({
      microphonePath,
      microphoneSegments: microphone.segments,
      outputPath,
      systemPath,
      systemSegments: system.segments,
    });
    const output = await ports.inspectOutput(outputPath);
    const storageKey = await ports.buildPlaybackStorageKey({ ...input, processingRunId });
    playbackStorageKey = storageKey;
    const cleanupRegistration = await ports.registerCleanupKey({
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
    await ports.uploadPlayback({
      contentType,
      deadlineAt: cleanupRegistration.writerLeaseExpiresAt,
      filePath: outputPath,
      sha256: output.sha256,
      sizeBytes: output.sizeBytes,
      storageKey,
    });
    if (!(await ports.verifyPlayback({ ...output, contentType, storageKey }))) {
      throw new Error("Mixed playback asset 完整性校验失败");
    }
    const published = await ports.publishPlayback({
      ...output,
      contentType,
      durationMs: Math.max(microphone.durationMs, system.durationMs),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      processingRunId,
      storageKey,
    });
    if (published) {
      try {
        await ports.removeCleanupKey({
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
        await ports.enqueueTranscription(input);
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
    try {
      cleanupPlayback = await ports.markFailed({ ...input, errorMessage, processingRunId });
    } catch (markFailedError) {
      console.error("[meeting-playback-worker] failed to persist processing failure", {
        errorName: markFailedError instanceof Error ? markFailedError.name : "UnknownError",
        meetingId: input.meetingId,
      });
    }
    throw error;
  } finally {
    if (cleanupPlayback && playbackStorageKey) {
      try {
        await ports.deletePlayback(playbackStorageKey);
        await ports.removeCleanupKey({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          storageKey: playbackStorageKey,
        });
      } catch (error) {
        console.error("[meeting-playback-worker] failed to remove unpublished playback", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: input.meetingId,
        });
      }
    }
    if (workingDirectory) {
      await ports.removeWorkingDirectory(workingDirectory);
    }
  }
}
