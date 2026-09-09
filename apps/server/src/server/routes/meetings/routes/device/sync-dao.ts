import { and, eq, max } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "@app/database";
import {
  meetingIntelligenceRevision,
  meetingProcessingRun,
  meetingRecordingAsset,
  meetingSession,
  meetingStorageCleanupKey,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
} from "@app/db-schema/schema";
import type {
  echoSyncIntelligenceSchema,
  echoSyncTranscriptSchema,
  echoArtifactSchema,
} from "@app/shared/meeting-device-processing";
import { completedIntelligenceSummary } from "@app/shared/meeting-completed-summary";
import { validateMeetingIntelligenceEvidence } from "@app/shared/meeting-intelligence";
import { rebuildMeetingSearchProjection } from "@app/meeting-processing/transcription";
import {
  MEETING_INTELLIGENCE_PIPELINE_VERSION,
  MEETING_INTELLIGENCE_PROMPT_VERSION,
} from "@app/meeting-processing-queue/meeting-intelligence";
import { lockEchoDeviceMeeting } from "./ownership-dao";
import type { EchoProcessingActor } from "./ownership-dao";
import { EchoProcessingError } from "./error";

export function createEchoSyncDao(db: Database) {
  return {
    intelligence: (
      input: EchoProcessingActor &
        z.infer<typeof echoSyncIntelligenceSchema> & { model: string; provider: string },
    ) =>
      db.transaction(async (tx) => {
        const meeting = await lockEchoDeviceMeeting(tx, input);
        const [existing] = await tx
          .select({ id: meetingIntelligenceRevision.id })
          .from(meetingIntelligenceRevision)
          .where(
            and(
              eq(meetingIntelligenceRevision.processingRunId, input.operationId),
              eq(meetingIntelligenceRevision.meetingId, input.meetingId),
            ),
          )
          .limit(1);
        if (existing) {
          return { revisionId: existing.id };
        }
        if (
          meeting.activeTranscriptRevisionId !== input.transcriptRevisionId ||
          meeting.activeIntelligenceRevisionId !== input.expectedIntelligenceRevisionId
        ) {
          throw new EchoProcessingError(409, "会议内容已更新，本地纪要已保留");
        }
        const turns = await tx
          .select({
            endMs: meetingTranscriptTurn.endMs,
            id: meetingTranscriptTurn.id,
            startMs: meetingTranscriptTurn.startMs,
          })
          .from(meetingTranscriptTurn)
          .where(eq(meetingTranscriptTurn.revisionId, input.transcriptRevisionId));
        if (
          !validateMeetingIntelligenceEvidence(input.content, new Set(turns.map((turn) => turn.id)))
        ) {
          throw new EchoProcessingError(409, "纪要证据不属于当前转录版本");
        }
        const [latest] = await tx
          .select({ revision: max(meetingIntelligenceRevision.revision) })
          .from(meetingIntelligenceRevision)
          .where(eq(meetingIntelligenceRevision.meetingId, input.meetingId));
        await tx.insert(meetingProcessingRun).values({
          attempt: 1,
          finishedAt: new Date(),
          id: input.operationId,
          idempotencyKey: `echo:${input.operationId}`,
          inputTranscriptRevisionId: input.transcriptRevisionId,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: MEETING_INTELLIGENCE_PIPELINE_VERSION,
          promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
          provider: input.provider,
          region: "global",
          requestKind: "automatic",
          requestedBy: input.userId,
          stage: "meeting-intelligence",
          status: "succeeded",
          templateKey: input.content.template,
        });
        const revisionId = `echo:${input.operationId}`;
        await tx.insert(meetingIntelligenceRevision).values({
          content: input.content,
          id: revisionId,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          processingRunId: input.operationId,
          promptVersion: MEETING_INTELLIGENCE_PROMPT_VERSION,
          provider: input.provider,
          revision: (latest?.revision ?? 0) + 1,
          templateKey: input.content.template,
          transcriptRevisionId: input.transcriptRevisionId,
        });
        await tx
          .update(meetingSession)
          .set({
            activeIntelligenceRevisionId: revisionId,
            intelligenceError: null,
            intelligenceRunId: null,
            intelligenceStatus: "ready",
            liveSummary:
              completedIntelligenceSummary({
                captureId: input.meetingId,
                content: input.content,
                model: input.model,
                now: new Date(),
                previous: meeting.liveSummary,
                provider: input.provider,
                turns,
              }) ?? meeting.liveSummary,
          })
          .where(eq(meetingSession.id, input.meetingId));
        await rebuildMeetingSearchProjection(tx, input);
        return { revisionId };
      }),
    playback: (
      input: EchoProcessingActor & {
        artifact: z.infer<typeof echoArtifactSchema>;
        storageKey: string;
      },
    ) =>
      db.transaction(async (tx) => {
        const meeting = await lockEchoDeviceMeeting(tx, input);
        if (!meeting.verifiedAt || input.artifact.kind !== "playback") {
          throw new EchoProcessingError(409, "源音频或回放资源尚未就绪");
        }
        const { artifact } = input;
        const asset = {
          contentType: artifact.contentType,
          durationMs: artifact.durationMs,
          sha256: artifact.sha256,
          sizeBytes: artifact.sizeBytes,
          status: "ready",
          storageKey: input.storageKey,
          uploadMode: "derived",
          verifiedAt: new Date(),
        };
        await tx
          .insert(meetingRecordingAsset)
          .values({
            ...asset,
            fragmentCount: 0,
            id: `${input.meetingId}:playback`,
            meetingId: input.meetingId,
            track: "playback",
          })
          .onConflictDoUpdate({
            set: asset,
            target: [meetingRecordingAsset.meetingId, meetingRecordingAsset.track],
          });
        await tx
          .update(meetingSession)
          .set({ processingError: null, processingRunId: null, status: "ready" })
          .where(eq(meetingSession.id, input.meetingId));
        await tx
          .delete(meetingStorageCleanupKey)
          .where(
            and(
              eq(meetingStorageCleanupKey.meetingId, input.meetingId),
              eq(meetingStorageCleanupKey.storageKey, input.storageKey),
            ),
          );
        await rebuildMeetingSearchProjection(tx, input);
        return { verified: true };
      }),
    transcript: (input: EchoProcessingActor & z.infer<typeof echoSyncTranscriptSchema>) =>
      db.transaction(async (tx) => {
        const meeting = await lockEchoDeviceMeeting(tx, input);
        if (!meeting.verifiedAt) {
          throw new EchoProcessingError(409, "请先完成源音频校验");
        }
        const [existing] = await tx
          .select()
          .from(meetingTranscriptRevision)
          .where(eq(meetingTranscriptRevision.id, input.transcript.revisionId))
          .limit(1);
        if (existing) {
          if (
            existing.meetingId !== input.meetingId ||
            existing.sourceManifestSha256 !== meeting.manifestSha256
          ) {
            throw new EchoProcessingError(409, "转录版本 ID 已绑定其他录音");
          }
          return { revisionId: existing.id };
        }
        if (meeting.activeTranscriptRevisionId !== input.expectedTranscriptRevisionId) {
          throw new EchoProcessingError(409, "转录已被更新，本地生成结果已保留");
        }
        const [latest] = await tx
          .select({ revision: max(meetingTranscriptRevision.revision) })
          .from(meetingTranscriptRevision)
          .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
        const { transcript } = input;
        await tx.insert(meetingProcessingRun).values({
          attempt: 1,
          finishedAt: new Date(),
          id: input.operationId,
          idempotencyKey: `echo:${input.operationId}`,
          meetingId: input.meetingId,
          model: transcript.model,
          organizationId: input.organizationId,
          pipelineVersion: transcript.pipelineVersion,
          provider: transcript.provider,
          region: transcript.region,
          stage: "final-transcription",
          status: "succeeded",
        });
        await tx.insert(meetingTranscriptRevision).values({
          id: transcript.revisionId,
          kind: "final",
          language: transcript.language,
          meetingId: input.meetingId,
          model: transcript.model,
          organizationId: input.organizationId,
          pipelineVersion: transcript.pipelineVersion,
          processingRunId: input.operationId,
          provider: transcript.provider,
          region: transcript.region,
          revision: (latest?.revision ?? 0) + 1,
          sourceManifestSha256: meeting.manifestSha256,
        });
        for (let offset = 0; offset < transcript.turns.length; offset += 1000) {
          await tx.insert(meetingTranscriptTurn).values(
            transcript.turns.slice(offset, offset + 1000).map((turn, index) => ({
              ...turn,
              revisionId: transcript.revisionId,
              sequence: offset + index,
            })),
          );
        }
        await tx
          .update(meetingSession)
          .set({
            activeTranscriptRevisionId: transcript.revisionId,
            transcriptionError: null,
            transcriptionRunId: null,
            transcriptionStatus: "ready",
          })
          .where(eq(meetingSession.id, input.meetingId));
        await rebuildMeetingSearchProjection(tx, input);
        return { revisionId: transcript.revisionId };
      }),
  };
}
