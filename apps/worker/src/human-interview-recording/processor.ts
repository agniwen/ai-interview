// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  downloadMeetingRecordingObjectToFile,
  headMeetingRecordingObject,
} from "@app/object-storage";
import type { createHumanInterviewRecordingDao } from "@app/meeting-processing/human-interview";
import type { createMeetingTranscriptionDao } from "@app/meeting-processing/transcription";
import type {
  HumanInterviewRecordingJobData,
  HumanInterviewTrackRecordingJobData,
} from "@app/meeting-processing-queue/human-interview-recording";
import type { enqueueMeetingTranscriptionJobs } from "@app/meeting-processing-queue/meeting-transcription";
import { Context, Data, Effect, Layer } from "effect";
import { z } from "zod";
import { detectCandidateSilence } from "@app/meeting-media";
import { retryTransientPromise } from "../effect/retry";
import { cleanupPreservingPrimary } from "../effect/cleanup";
import { settleAllOrThrow } from "../effect/parallel";
import { captureWorkerException } from "../sentry";

export interface HumanInterviewRecordingProcessorDependencies {
  detectSilence?: typeof detectCandidateSilence;
  inspectAudio?: (path: string) => Promise<number>;
  download: typeof downloadMeetingRecordingObjectToFile;
  enqueueTranscription: typeof enqueueMeetingTranscriptionJobs;
  getTranscriptionJob: ReturnType<
    typeof createMeetingTranscriptionDao
  >["getMeetingTranscriptionJobForMeeting"];
  head: typeof headMeetingRecordingObject;
  ingest: ReturnType<typeof createHumanInterviewRecordingDao>["ingestHumanInterviewRecording"];
  markError: ReturnType<
    typeof createHumanInterviewRecordingDao
  >["saveHumanInterviewRecordingProcessingError"];
  markTranscriptionUnavailable: ReturnType<
    typeof createHumanInterviewRecordingDao
  >["markHumanInterviewTranscriptionUnavailable"];
}

export class HumanInterviewRecordingProcessor extends Context.Service<
  HumanInterviewRecordingProcessor,
  HumanInterviewRecordingProcessorDependencies
>()("@app/worker/HumanInterviewRecordingProcessor") {}

export const humanInterviewRecordingProcessorLayer = (
  dependencies: HumanInterviewRecordingProcessorDependencies,
) => Layer.succeed(HumanInterviewRecordingProcessor, dependencies);

class HumanInterviewRecordingFailure extends Data.TaggedError("HumanInterviewRecordingFailure")<{
  readonly cause: unknown;
}> {}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function runHumanInterviewRecordingProcessingPromise(
  input: HumanInterviewRecordingJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: HumanInterviewRecordingProcessorDependencies,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "human-interview-recording-"));
  const roomFilePath = join(directory, "room-audio.ogg");
  const candidateFilePath = join(directory, "candidate-audio.ogg");
  let primaryCause: unknown;
  let hasPrimaryFailure = false;
  try {
    if ("tracks" in input) {
      // oxlint-disable-next-line no-use-before-define -- the v2 branch shares this existing cleanup boundary.
      await ingestTrackRecordings(input, context, directory, dependencies);
      return;
    }
    const [roomObject, candidateObject] = await settleAllOrThrow([
      retryTransientPromise(() => dependencies.head(input.fileKey)),
      retryTransientPromise(() => dependencies.head(input.candidateFileKey)),
    ]);
    if (!roomObject || roomObject.contentLength <= 0) {
      throw new Error("真人复面录音文件不存在或为空");
    }
    if (!candidateObject || candidateObject.contentLength <= 0) {
      throw new Error("真人复面候选人录音文件不存在或为空");
    }
    if (roomObject.contentLength !== input.sizeBytes) {
      throw new Error("真人复面录音文件大小与 LiveKit 结果不一致");
    }
    if (candidateObject.contentLength !== input.candidateSizeBytes) {
      throw new Error("真人复面候选人录音文件大小与 LiveKit 结果不一致");
    }
    await settleAllOrThrow([
      retryTransientPromise(() =>
        dependencies.download({ filePath: roomFilePath, storageKey: input.fileKey }),
      ),
      retryTransientPromise(() =>
        dependencies.download({
          filePath: candidateFilePath,
          storageKey: input.candidateFileKey,
        }),
      ),
    ]);
    const [roomAssetSha256, candidateAssetSha256] = await settleAllOrThrow([
      sha256File(roomFilePath),
      sha256File(candidateFilePath),
    ]);
    const manifestSha256 = createHash("sha256")
      .update(
        JSON.stringify([
          {
            durationMs: input.durationMs,
            sha256: roomAssetSha256,
            sizeBytes: input.sizeBytes,
            track: "mixed",
          },
          {
            durationMs: input.candidateDurationMs,
            sha256: candidateAssetSha256,
            sizeBytes: input.candidateSizeBytes,
            track: "candidate",
          },
        ]),
      )
      .digest("hex");
    const result = await dependencies.ingest({
      candidate: {
        assetSha256: candidateAssetSha256,
        contentType: candidateObject.contentType || "audio/ogg",
        durationMs: input.candidateDurationMs,
        fileKey: input.candidateFileKey,
        sizeBytes: input.candidateSizeBytes,
      },
      manifestSha256,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      room: {
        assetSha256: roomAssetSha256,
        contentType: roomObject.contentType || "audio/ogg",
        durationMs: input.durationMs,
        fileKey: input.fileKey,
        sizeBytes: input.sizeBytes,
      },
    });
    const transcriptionJob = await dependencies.getTranscriptionJob({
      meetingId: result.meetingSessionId,
      organizationId: result.organizationId,
    });
    await (transcriptionJob
      ? dependencies.enqueueTranscription([transcriptionJob])
      : dependencies.markTranscriptionUnavailable({
          meetingSessionId: result.meetingSessionId,
          organizationId: result.organizationId,
        }));
  } catch (error) {
    primaryCause = error;
    hasPrimaryFailure = true;
    const message = error instanceof Error ? error.message : "真人复面录音处理失败";
    await dependencies.markError({
      error: message,
      meetingId: input.meetingId,
      terminal: context.attempt >= context.maxAttempts,
    });
    throw error;
  } finally {
    await cleanupPreservingPrimary({
      cleanup: () => rm(directory, { force: true, recursive: true }),
      hasPrimaryFailure,
      onCleanupFailure: (error) => {
        captureWorkerException(error, "worker.human-interview-recording.cleanup", {
          meetingId: input.meetingId,
        });
        console.error("[human-interview-recording-worker] failed to remove working directory", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: input.meetingId,
        });
      },
      primaryCause,
    });
  }
}

async function inspectRecordedAudio(path: string): Promise<number> {
  const { stdout } = await promisify(execFile)(
    process.env.FFPROBE_BIN || "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type:format=duration",
      "-of",
      "json",
      path,
    ],
    { timeout: 30_000 },
  );
  const result = z
    .object({
      format: z.object({ duration: z.string().optional() }).optional(),
      streams: z.array(z.object({ codec_type: z.string() })).optional(),
    })
    .parse(JSON.parse(stdout));
  const duration = Number(result.format?.duration) * 1000;
  if (
    !result.streams?.some((stream) => stream.codec_type === "audio") ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error("录音没有可解码的音频或有效时长");
  }
  return duration;
}

// oxlint-disable-next-line complexity -- Each source is verified independently before deriving shared recovery ranges.
async function ingestTrackRecordings(
  input: HumanInterviewTrackRecordingJobData,
  context: { attempt: number; maxAttempts: number },
  directory: string,
  dependencies: HumanInterviewRecordingProcessorDependencies,
) {
  const verified: {
    track: HumanInterviewTrackRecordingJobData["tracks"][number] & { startedAtMs: number };
    sha256: string;
    contentType: string;
    silenceRanges: { startMs: number; endMs: number }[];
  }[] = [];
  const failed = input.tracks.filter((track) => track.status !== "completed");
  if (
    input.tracks.reduce((size, track) => size + track.sizeBytes, 0) > 2 * 1024 ** 3 ||
    input.tracks.some((track) => track.durationMs > 8 * 3_600_000)
  ) {
    throw new Error("真人复面录音超出处理资源上限");
  }
  for (const track of input.tracks.filter((item) => item.status === "completed")) {
    try {
      if (!track.startedAtMs) {
        throw new Error("分轨录音缺少实际开始时间");
      }
      const object = await retryTransientPromise(() => dependencies.head(track.fileKey));
      if (!object || object.contentLength <= 0 || object.contentLength !== track.sizeBytes) {
        throw new Error("录音文件缺失或大小不一致");
      }
      const path = join(directory, `${track.id}.ogg`);
      await retryTransientPromise(() =>
        dependencies.download({ filePath: path, storageKey: track.fileKey }),
      );
      const duration = await (dependencies.inspectAudio ?? inspectRecordedAudio)(path);
      if (Math.abs(duration - track.durationMs) > 2000) {
        throw new Error("录音时长与录制结果不一致");
      }
      verified.push({
        contentType: object.contentType || "audio/ogg",
        sha256: await sha256File(path),
        silenceRanges:
          track.role === "candidate"
            ? await (dependencies.detectSilence ?? detectCandidateSilence)(
                path,
                track.durationMs,
              ).catch(() => [])
            : [],
        track: { ...track, startedAtMs: track.startedAtMs },
      });
    } catch (error) {
      if (context.attempt < context.maxAttempts) {
        throw error;
      }
      failed.push({ ...track, error: error instanceof Error ? error.message : "录音文件校验失败" });
    }
  }
  if (!verified.length) {
    throw new Error("没有可用录音，请手动填写面试评价");
  }
  const start = Math.min(...verified.map(({ track }) => track.startedAtMs));
  const end = Math.max(...verified.map(({ track }) => track.startedAtMs + track.durationMs));
  const recoveryRanges = [
    ...(["candidate", "interviewer"].some(
      (role) => !verified.some(({ track }) => track.role === role),
    )
      ? [{ endMs: end - start, startMs: 0 }]
      : []),
    ...failed
      .filter((track) => track.role !== "mixed")
      .map((track) => ({
        endMs: Math.max(0, (track.unpublishedAtMs ?? end) - start),
        startMs: Math.max(0, track.publishedAtMs - start),
      })),
    ...verified
      .filter(
        ({ track }) => track.role !== "mixed" && track.startedAtMs - track.publishedAtMs > 1000,
      )
      .map(({ track }) => ({
        endMs: track.startedAtMs - start,
        startMs: Math.max(0, track.publishedAtMs - start),
      })),
    ...verified
      .filter(({ track }) => track.role !== "mixed")
      .map(({ track }) => ({
        endMs: (track.unpublishedAtMs ?? end) - start,
        startMs: track.startedAtMs + track.durationMs - start,
      }))
      .filter((range) => range.endMs - range.startMs > 1000),
  ].filter((range) => range.endMs > range.startMs);
  // Keep one legacy playback slot, but never discard other successful room attempts.
  // Additional sources use the existing unique source-track namespace; identity owns their role.
  const playbackMix = verified
    .filter(({ track }) => track.role === "mixed")
    .toSorted(
      (a, b) =>
        b.track.durationMs - a.track.durationMs ||
        a.track.startedAtMs - b.track.startedAtMs ||
        a.track.id.localeCompare(b.track.id),
    )[0]?.track.id;
  const assets = verified.map(({ track, sha256, contentType, silenceRanges }) => ({
    assetSha256: sha256,
    contentType,
    durationMs: track.durationMs,
    fileKey: track.fileKey,
    recordingIdentity: {
      offsetMs: track.startedAtMs - start,
      participantIdentity: track.participantIdentity,
      recoveryRanges: track.role === "mixed" ? recoveryRanges : undefined,
      role: track.role === "mixed" ? ("unknown" as const) : track.role,
      // An unavailable candidate track could overlap a healthy one. Do not use silence to exclude
      // the candidate when any of their tracks failed verification; ASR absence is not evidence.
      silenceRanges: failed.some((item) => item.role === "candidate")
        ? []
        : silenceRanges.map((range) => ({
            endMs: range.endMs + track.startedAtMs - start,
            startMs: range.startMs + track.startedAtMs - start,
          })),
      sourceId: track.id,
    },
    sizeBytes: track.sizeBytes,
    speakerDisplayName: track.displayName,
    track: track.id === playbackMix ? "mixed" : `participant-${track.id}`,
  }));
  const manifestSha256 = createHash("sha256")
    .update(JSON.stringify(assets.toSorted((a, b) => a.track.localeCompare(b.track))))
    .digest("hex");
  const result = await dependencies.ingest({
    assets,
    manifestSha256,
    meetingId: input.meetingId,
    organizationId: input.organizationId,
    startedAtMs: start,
    warning:
      failed.length || recoveryRanges.length
        ? "部分录音不完整，已保留可用音轨；全场补救中的身份不明内容需要人工确认。"
        : null,
  });
  const job = await dependencies.getTranscriptionJob({
    meetingId: result.meetingSessionId,
    organizationId: result.organizationId,
  });
  await (job
    ? dependencies.enqueueTranscription([job])
    : dependencies.markTranscriptionUnavailable({
        meetingSessionId: result.meetingSessionId,
        organizationId: result.organizationId,
      }));
}

export function runHumanInterviewRecordingProcessingEffect(
  input: HumanInterviewRecordingJobData,
  context: { attempt: number; maxAttempts: number },
) {
  return Effect.gen(function* () {
    const dependencies = yield* HumanInterviewRecordingProcessor;
    yield* Effect.tryPromise({
      catch: (cause) => new HumanInterviewRecordingFailure({ cause }),
      try: () => runHumanInterviewRecordingProcessingPromise(input, context, dependencies),
    });
  });
}

export async function runHumanInterviewRecordingProcessing(
  input: HumanInterviewRecordingJobData,
  context: { attempt: number; maxAttempts: number },
  dependencies: HumanInterviewRecordingProcessorDependencies,
): Promise<void> {
  await Effect.runPromise(
    runHumanInterviewRecordingProcessingEffect(input, context).pipe(
      Effect.provide(humanInterviewRecordingProcessorLayer(dependencies)),
      Effect.catchTag("HumanInterviewRecordingFailure", (failure) => Effect.fail(failure.cause)),
    ),
  );
}
