// oxlint-disable max-classes-per-file, func-names -- Effect services and tagged errors are class-based; Effect.gen uses generator callbacks.
import { createHash } from "node:crypto";
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
import type { HumanInterviewRecordingJobData } from "@app/meeting-processing-queue/human-interview-recording";
import type { enqueueMeetingTranscriptionJobs } from "@app/meeting-processing-queue/meeting-transcription";
import { Context, Data, Effect, Layer } from "effect";
import { retryTransientPromise } from "../effect/retry";
import { cleanupPreservingPrimary } from "../effect/cleanup";
import { settleAllOrThrow } from "../effect/parallel";
import { captureWorkerException } from "../sentry";

export interface HumanInterviewRecordingProcessorDependencies {
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
