import { z } from "zod";
import type { JsonValue } from "@app/db-schema/json";
import {
  buildMeetingPlaybackAssetKey,
  buildMeetingTranscriptionStagingKey,
  headMeetingRecordingObject,
  presignMeetingRecordingPutObject,
  presignRecordingGetObjectUrl,
} from "@app/object-storage";
import {
  createQwenAsrMeetingTranscriptionProvider,
  findMeetingTranscriptionProviderCandidate,
  resolveMeetingTranscriptionProviderModel,
  resolveMeetingTranscriptionQwenBaseUrl,
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "@app/meeting-processing/transcription";
import {
  generateMeetingIntelligenceStep,
  getMeetingIntelligenceGeneratorSnapshot,
  reusableLiveSummaryPrefix,
} from "@app/meeting-processing/intelligence";
import { MEETING_TRANSCRIPTION_PIPELINE_VERSION } from "@app/meeting-processing-queue/meeting-transcription";
import {
  echoDeviceContextSchema,
  echoSubmitTranscriptionSchema,
  echoTranscriptionChunkSchema,
  echoSyncIntelligenceSchema,
} from "@app/shared/meeting-device-processing";
import type {
  echoArtifactSchema,
  echoIntelligenceStepSchema,
  echoPollTranscriptionSchema,
  echoSyncTranscriptSchema,
} from "@app/shared/meeting-device-processing";
import { meetingLiveTranscriptDraftSchema } from "@app/shared/meeting-transcription";
import { meetingLiveSummarySnapshotSchema } from "@app/shared/meeting-live-summary";
import { db } from "../../../../../lib/server/db";
import { assertEchoDeviceOwnership } from "./ownership-dao";
import type { EchoProcessingActor } from "./ownership-dao";
import { createEchoRequestDao } from "./request-dao";
import { createEchoContextDao } from "./context-dao";
import type { EchoContextInput } from "./context-dao";
import { createEchoSyncDao } from "./sync-dao";
import { registerEchoArtifact } from "./artifact-dao";
import { EchoProcessingError } from "./error";

const requests = createEchoRequestDao(db);
const contexts = createEchoContextDao(db);
const synchronization = createEchoSyncDao(db);

function transcriptionSnapshot(assets: { status: string; track: string }[]) {
  const candidate = findMeetingTranscriptionProviderCandidate("qwen");
  if (!candidate) {
    throw new EchoProcessingError(503, "转写服务尚未配置");
  }
  return {
    languageHint: null,
    model: resolveMeetingTranscriptionProviderModel(
      candidate,
      assets.map((asset) => ({ ...asset, status: "ready" })),
    ),
    pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
    provider: "qwen" as const,
    region: candidate.region,
  };
}

export async function getEchoDeviceContext(input: EchoContextInput) {
  const loaded = await contexts.load(input);
  const { meeting } = loaded;
  return echoDeviceContextSchema.parse({
    accountId: meeting.processingAccountId,
    deviceId: meeting.processingDeviceId,
    epoch: meeting.processingEpoch,
    intelligence: loaded.intelligence,
    intelligenceModel: getMeetingIntelligenceGeneratorSnapshot(),
    intelligenceRevisionId: meeting.activeIntelligenceRevisionId,
    // oxlint-disable-next-line promise/prefer-await-to-then -- Zod catch defines the legacy JSON fallback, not a Promise handler.
    liveSummary: meetingLiveSummarySnapshotSchema.nullable().catch(null).parse(meeting.liveSummary),
    liveTranscriptDraft: meetingLiveTranscriptDraftSchema
      .nullable()
      // oxlint-disable-next-line promise/prefer-await-to-then -- Zod legacy JSON fallback.
      .catch(null)
      .parse(meeting.liveTranscriptDraft),
    manifestSha256: meeting.manifestSha256,
    meetingId: meeting.id,
    playbackReady: meeting.assets.some(
      (asset) => asset.track === "playback" && asset.status === "ready",
    ),
    processingComplete:
      meeting.status === "ready" &&
      meeting.transcriptionStatus === "ready" &&
      meeting.intelligenceStatus === "ready",
    processingOwner: meeting.processingOwner,
    recoveryCopyDeleteAfter: meeting.recoveryCopyDeleteAfter?.toISOString() ?? null,
    savedAt: meeting.savedAt.toISOString(),
    sourceVerified: meeting.verifiedAt !== null,
    startedAt: meeting.startedAt.toISOString(),
    suggestedTemplate: loaded.suggestedTemplate,
    title: meeting.title,
    transcript: loaded.transcript,
    transcription: transcriptionSnapshot(meeting.assets),
  });
}

export async function adoptEchoDeviceProcessing(
  input: EchoContextInput & { epoch: number; deviceId: string; regenerate?: boolean },
) {
  await contexts.adopt(input);
  const context = await getEchoDeviceContext(input);
  const { meeting } = await contexts.load(input);
  const sources = await Promise.all(
    meeting.assets
      .filter(
        (asset) =>
          (asset.track === "microphone" || asset.track === "system") && asset.status === "ready",
      )
      .map(async (asset) => ({
        contentType: asset.contentType,
        durationMs: asset.durationMs,
        fragmentCount: asset.fragmentCount,
        segments: asset.segments,
        sha256: asset.sha256,
        sizeBytes: asset.sizeBytes,
        track: asset.track,
        url: await presignRecordingGetObjectUrl(asset.storageKey, 3600),
      })),
  );
  return { context, sources };
}

function artifactKey(
  input: EchoProcessingActor & { artifact: z.infer<typeof echoArtifactSchema> },
): Promise<string> {
  const token = `echo-${input.epoch}-${input.artifact.artifactId}-${input.artifact.sha256}`;
  return input.artifact.kind === "playback"
    ? buildMeetingPlaybackAssetKey({ ...input, processingRunId: token })
    : buildMeetingTranscriptionStagingKey({
        ...input,
        index: 0,
        stagingToken: token,
        track: "system",
      });
}

export async function planEchoArtifact(
  input: EchoProcessingActor & { artifact: z.infer<typeof echoArtifactSchema> },
) {
  await assertEchoDeviceOwnership(db, input);
  const storageKey = await artifactKey(input);
  await registerEchoArtifact(db, { ...input, storageKey });
  const upload = await presignMeetingRecordingPutObject({
    ...input.artifact,
    expiresInSeconds: 300,
    storageKey,
  });
  return { headers: upload.headers, method: "PUT" as const, url: upload.url };
}

async function verifyEchoArtifact(
  input: EchoProcessingActor & { artifact: z.infer<typeof echoArtifactSchema> },
): Promise<string> {
  await assertEchoDeviceOwnership(db, input);
  const storageKey = await artifactKey(input);
  const stored = await headMeetingRecordingObject(storageKey);
  if (
    !stored ||
    stored.sha256 !== input.artifact.sha256 ||
    stored.contentLength !== input.artifact.sizeBytes ||
    stored.contentType !== input.artifact.contentType ||
    stored.checksumSha256 !== Buffer.from(input.artifact.sha256, "hex").toString("base64")
  ) {
    throw new EchoProcessingError(409, "音频产物未通过完整性校验，本地数据已保留");
  }
  return storageKey;
}

export async function runEchoRequest<T extends JsonValue>(
  input: EchoProcessingActor & { operationId: string; kind: string; payload: JsonValue },
  operation: () => Promise<T>,
) {
  const claim = await requests.claim(input);
  if (claim.state !== "claimed") {
    return claim;
  }
  try {
    const result = await operation();
    await requests.complete({ ...input, result, token: claim.token });
    return { result, state: "complete" as const };
  } catch (error) {
    await requests.release({ operationId: input.operationId, token: claim.token });
    if (error instanceof MeetingProviderQuotaError) {
      throw new EchoProcessingError(429, "转写配额不足，请稍后手动重试");
    }
    throw error;
  }
}

function qwenProvider(model: string) {
  return createQwenAsrMeetingTranscriptionProvider({
    apiKey: process.env.ALIBABA_API_KEY?.trim() ?? "",
    baseUrl: resolveMeetingTranscriptionQwenBaseUrl(),
    createAudioUrl: (chunk) => presignRecordingGetObjectUrl(chunk.filePath, 3600),
    model,
  });
}

export function submitEchoTranscription(
  input: EchoProcessingActor & z.infer<typeof echoSubmitTranscriptionSchema>,
) {
  return runEchoRequest(
    { ...input, kind: "transcription-submit", payload: echoSubmitTranscriptionSchema.parse(input) },
    async () => {
      if (
        input.artifact.kind !== "chunk" ||
        input.artifact.durationMs !== input.chunk.endMs - input.chunk.startMs
      ) {
        throw new EchoProcessingError(409, "转写音频与分段不一致");
      }
      const storageKey = await verifyEchoArtifact(input);
      const context = await getEchoDeviceContext(input);
      if (context.transcription.model !== input.model) {
        throw new EchoProcessingError(409, "转写模型配置已变化，请重新开始处理；已有分段已保留");
      }
      const chunk = {
        ...input.chunk,
        contentType: input.artifact.contentType,
        filePath: storageKey,
      };
      const taskId = await qwenProvider(context.transcription.model).submitTask({
        audioUrl: await presignRecordingGetObjectUrl(storageKey, 3600),
        chunk,
        signal: AbortSignal.timeout(90_000),
      });
      return {
        chunk,
        languageHint: context.transcription.languageHint,
        model: context.transcription.model,
        taskId,
      };
    },
  );
}

const submissionSchema = z.object({
  chunk: echoTranscriptionChunkSchema.safeExtend({ contentType: z.string(), filePath: z.string() }),
  languageHint: z.string().nullable(),
  model: z.string(),
  taskId: z.string(),
});
export async function pollEchoTranscription(
  input: EchoProcessingActor & z.infer<typeof echoPollTranscriptionSchema>,
) {
  const submission = submissionSchema.parse(
    await requests.read({
      ...input,
      kind: "transcription-submit",
      operationId: input.submissionId,
    }),
  );
  try {
    return await qwenProvider(submission.model).readTask({
      ...submission,
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    if (error instanceof MeetingProviderResponseError) {
      return { message: error.message, state: "failed" as const };
    }
    throw error;
  }
}

export function generateEchoIntelligenceStep(
  input: EchoProcessingActor & z.infer<typeof echoIntelligenceStepSchema>,
) {
  return runEchoRequest(
    { ...input, kind: "intelligence-step", payload: z.json().parse(input) },
    async () => {
      const generator = getMeetingIntelligenceGeneratorSnapshot();
      if (
        generator.model !== input.generator.model ||
        generator.provider !== input.generator.provider
      ) {
        throw new EchoProcessingError(409, "纪要模型配置已变化，请重新生成；本地进度已保留");
      }
      const { meeting } = await contexts.load(input);
      const turns = input.transcript.turns.map((turn) => ({
        ...turn,
        speakerDisplayName: turn.speakerDisplayName ?? null,
      }));
      const livePrefix = await reusableLiveSummaryPrefix({
        draft: meeting.liveTranscriptDraft,
        snapshot: meeting.liveSummary,
        startedAt: meeting.startedAt,
        turns,
      });
      const result = await generateMeetingIntelligenceStep(
        { template: input.template, turns },
        input.progress,
        undefined,
        livePrefix,
      );
      return {
        ...result,
        generator: { ...generator },
        transcriptRevisionId: input.transcript.revisionId,
      };
    },
  );
}

export function synchronizeEchoTranscript(
  input: EchoProcessingActor & z.infer<typeof echoSyncTranscriptSchema>,
) {
  return runEchoRequest({ ...input, kind: "sync-transcript", payload: z.json().parse(input) }, () =>
    synchronization.transcript(input),
  );
}

export function synchronizeEchoIntelligence(
  input: EchoProcessingActor & z.infer<typeof echoSyncIntelligenceSchema>,
) {
  return runEchoRequest(
    { ...input, kind: "sync-intelligence", payload: z.json().parse(input) },
    async () => {
      const generated = z
        .object({
          content: echoSyncIntelligenceSchema.shape.content,
          generator: z.object({ model: z.string(), provider: z.string() }),
          state: z.literal("ready"),
          transcriptRevisionId: z.string(),
        })
        .parse(
          await requests.read({
            ...input,
            kind: "intelligence-step",
            operationId: input.generationOperationId,
          }),
        );
      if (generated.transcriptRevisionId !== input.transcriptRevisionId) {
        throw new EchoProcessingError(409, "纪要生成输入与同步版本不一致");
      }
      return synchronization.intelligence({
        ...input,
        content: generated.content,
        ...generated.generator,
      });
    },
  );
}

export async function synchronizeEchoPlayback(
  input: EchoProcessingActor & { artifact: z.infer<typeof echoArtifactSchema> },
) {
  const storageKey = await verifyEchoArtifact(input);
  return synchronization.playback({ ...input, storageKey });
}
