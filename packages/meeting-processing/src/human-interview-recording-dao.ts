import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, asc, eq, isNotNull, isNull, notLike, or } from "drizzle-orm";
import {
  meetingRecordingAsset,
  recruitingMeetingContext,
  meetingSession,
  humanInterviewMeeting,
  humanTranscriptionRun,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewRecordingJobData } from "@app/job-queues/human-interview-recording";

import type { Database } from "@app/database";
import type { RecordingIdentity } from "@app/db-schema/human-interview-recording";
import {
  publishLiveTranscriptRevisionTx,
  selectLiveTranscriptSource,
} from "./human-interview-live-transcript-promotion";

export interface VerifiedHumanRecordingAsset {
  assetSha256: string;
  contentType: string;
  durationMs: number;
  fileKey: string;
  sizeBytes: number;
  track: string;
  speakerDisplayName: string | null;
  recordingIdentity?: RecordingIdentity;
}

export function createHumanInterviewRecordingDao(db: Database) {
  const TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX = "录音处理失败：";

  async function listRecoverableHumanInterviewRecordingJobs(): Promise<
    HumanInterviewRecordingJobData[]
  > {
    const trackedMeetings = await db
      .select()
      .from(humanInterviewMeeting)
      .where(
        and(
          isNotNull(humanInterviewMeeting.recordingTracks),
          eq(humanInterviewMeeting.status, "ended"),
          isNull(humanInterviewMeeting.recordingIngestedAt),
          or(
            isNull(humanInterviewMeeting.recordingError),
            notLike(
              humanInterviewMeeting.recordingError,
              `${TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX}%`,
            ),
          ),
        ),
      );
    const trackedJobs: HumanInterviewRecordingJobData[] = trackedMeetings.flatMap((meeting) => {
      const tracks = meeting.recordingTracks ?? [];
      return tracks.length &&
        tracks.every((track) => track.status === "completed" || track.status === "failed")
        ? [
            {
              meetingId: meeting.id,
              organizationId: meeting.organizationId,
              tracks,
              version: 2 as const,
            },
          ]
        : [];
    });
    const rows = await db
      .select({
        candidateDurationMs: humanInterviewMeeting.candidateRecordingDurationMs,
        candidateEgressId: humanInterviewMeeting.candidateRecordingEgressId,
        candidateFileKey: humanInterviewMeeting.candidateRecordingFileKey,
        candidateSizeBytes: humanInterviewMeeting.candidateRecordingSizeBytes,
        durationMs: humanInterviewMeeting.recordingDurationMs,
        egressId: humanInterviewMeeting.recordingEgressId,
        fileKey: humanInterviewMeeting.recordingFileKey,
        meetingId: humanInterviewMeeting.id,
        organizationId: humanInterviewMeeting.organizationId,
        sizeBytes: humanInterviewMeeting.recordingSizeBytes,
      })
      .from(humanInterviewMeeting)
      .where(
        and(
          isNull(humanInterviewMeeting.recordingTracks),
          eq(humanInterviewMeeting.recordingStatus, "completed"),
          eq(humanInterviewMeeting.candidateRecordingStatus, "completed"),
          isNull(humanInterviewMeeting.processingMeetingSessionId),
          or(
            isNull(humanInterviewMeeting.recordingError),
            notLike(
              humanInterviewMeeting.recordingError,
              `${TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX}%`,
            ),
          ),
          isNotNull(humanInterviewMeeting.recordingDurationMs),
          isNotNull(humanInterviewMeeting.recordingEgressId),
          isNotNull(humanInterviewMeeting.recordingFileKey),
          isNotNull(humanInterviewMeeting.recordingSizeBytes),
          isNotNull(humanInterviewMeeting.candidateRecordingDurationMs),
          isNotNull(humanInterviewMeeting.candidateRecordingEgressId),
          isNotNull(humanInterviewMeeting.candidateRecordingFileKey),
          isNotNull(humanInterviewMeeting.candidateRecordingSizeBytes),
        ),
      );
    return [
      ...trackedJobs,
      ...rows.flatMap((row) =>
        row.durationMs &&
        row.egressId &&
        row.fileKey &&
        row.sizeBytes &&
        row.candidateDurationMs &&
        row.candidateEgressId &&
        row.candidateFileKey &&
        row.candidateSizeBytes
          ? [
              {
                candidateDurationMs: row.candidateDurationMs,
                candidateEgressId: row.candidateEgressId,
                candidateFileKey: row.candidateFileKey,
                candidateSizeBytes: row.candidateSizeBytes,
                durationMs: row.durationMs,
                egressId: row.egressId,
                fileKey: row.fileKey,
                meetingId: row.meetingId,
                organizationId: row.organizationId,
                sizeBytes: row.sizeBytes,
              },
            ]
          : [],
      ),
    ];
  }

  async function saveHumanInterviewRecordingProcessingError(input: {
    error: string;
    meetingId: string;
    terminal: boolean;
  }): Promise<void> {
    await db
      .update(humanInterviewMeeting)
      .set({
        recordingError: input.terminal
          ? `${TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX}${input.error}`
          : `录音处理中断，等待重试：${input.error}`,
        updatedAt: new Date(),
      })
      .where(eq(humanInterviewMeeting.id, input.meetingId));
  }

  async function markHumanInterviewTranscriptionUnavailable(input: {
    meetingSessionId: string;
    organizationId: string;
  }): Promise<void> {
    await db
      .update(meetingSession)
      .set({
        transcriptionError: "当前没有可用的会议转录服务，可直接人工补录。",
        transcriptionRunId: null,
        transcriptionStatus: "failed",
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingSessionId),
          eq(meetingSession.organizationId, input.organizationId),
          isNull(meetingSession.activeTranscriptRevisionId),
        ),
      );
  }

  async function ingestHumanInterviewRecording(input: {
    assets?: VerifiedHumanRecordingAsset[];
    startedAtMs?: number;
    warning?: string | null;
    candidate?: {
      assetSha256: string;
      contentType: string;
      durationMs: number;
      fileKey: string;
      sizeBytes: number;
    };
    manifestSha256: string;
    meetingId: string;
    organizationId: string;
    room?: {
      assetSha256: string;
      contentType: string;
      durationMs: number;
      fileKey: string;
      sizeBytes: number;
    };
  }): Promise<{
    liveTranscriptPublished: boolean;
    meetingSessionId: string;
    organizationId: string;
  }> {
    // oxlint-disable-next-line complexity -- legacy and identity-aware admission share one atomic meeting creation boundary.
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          candidateRecordingFileKey: humanInterviewMeeting.candidateRecordingFileKey,
          candidateRecordingStatus: humanInterviewMeeting.candidateRecordingStatus,
          createdAt: humanInterviewMeeting.createdAt,
          createdBy: humanInterviewMeeting.createdBy,
          endedAt: humanInterviewMeeting.endedAt,
          processingMeetingSessionId: humanInterviewMeeting.processingMeetingSessionId,
          recordingFileKey: humanInterviewMeeting.recordingFileKey,
          recordingStatus: humanInterviewMeeting.recordingStatus,
          recordingTracks: humanInterviewMeeting.recordingTracks,
          scheduledAt: humanInterviewMeeting.scheduledAt,
          startedAt: humanInterviewMeeting.startedAt,
          title: humanInterviewMeeting.title,
          transcriptionMode: humanInterviewMeeting.transcriptionMode,
        })
        .from(humanInterviewMeeting)
        .where(
          and(
            eq(humanInterviewMeeting.id, input.meetingId),
            eq(humanInterviewMeeting.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        throw new Error("真人复面会议不存在");
      }
      if (
        !input.assets &&
        (meeting.recordingStatus !== "completed" ||
          meeting.recordingFileKey !== input.room?.fileKey ||
          meeting.candidateRecordingStatus !== "completed" ||
          meeting.candidateRecordingFileKey !== input.candidate?.fileKey)
      ) {
        throw new Error("真人复面录音尚未完成或文件已变化");
      }
      if (
        input.assets?.some(
          (asset) =>
            !meeting.recordingTracks?.some(
              (track) =>
                track.status === "completed" &&
                track.fileKey === asset.fileKey &&
                track.sizeBytes === asset.sizeBytes,
            ),
        )
      ) {
        throw new Error("真人复面分轨清单已变化");
      }
      const [round] = await tx
        .select({
          candidateName: recruitingRecordReadModel.candidateName,
          interviewRecordId: humanInterviewRound.recruitingRecordId,
          roundId: humanInterviewRound.id,
        })
        .from(humanInterviewMeetingRound)
        .innerJoin(
          humanInterviewRound,
          eq(humanInterviewMeetingRound.roundId, humanInterviewRound.id),
        )
        .innerJoin(
          recruitingRecordReadModel,
          eq(humanInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
        )
        .where(eq(humanInterviewMeetingRound.meetingId, input.meetingId))
        .limit(1);
      const assets: VerifiedHumanRecordingAsset[] = input.assets ?? [
        ...(input.room ? [{ ...input.room, speakerDisplayName: null, track: "mixed" }] : []),
        ...(input.candidate
          ? [
              {
                ...input.candidate,
                speakerDisplayName: round ? `候选人 · ${round.candidateName}` : "候选人",
                track: "candidate",
              },
            ]
          : []),
      ];
      // 字幕已在会议结束时发布为正式转录：录音只作为归档挂到同一场会议。
      if (meeting.processingMeetingSessionId) {
        const [session] = await tx
          .select()
          .from(meetingSession)
          .where(eq(meetingSession.id, meeting.processingMeetingSessionId))
          .for("update");
        if (!session) {
          throw new Error("会议材料不存在");
        }
        const existing = await tx
          .select({ key: meetingRecordingAsset.storageKey })
          .from(meetingRecordingAsset)
          .where(eq(meetingRecordingAsset.meetingId, session.id));
        const fresh = assets.filter((asset) => !existing.some((row) => row.key === asset.fileKey));
        if (fresh.length) {
          await tx.insert(meetingRecordingAsset).values(
            fresh.map((asset) => ({
              contentType: asset.contentType,
              durationMs: asset.durationMs,
              fragmentCount: 1,
              id: crypto.randomUUID(),
              meetingId: session.id,
              recordingIdentity: asset.recordingIdentity
                ? {
                    ...asset.recordingIdentity,
                    offsetMs:
                      asset.recordingIdentity.offsetMs +
                      (input.startedAtMs ?? session.startedAt.getTime()) -
                      session.startedAt.getTime(),
                  }
                : undefined,
              sha256: asset.assetSha256,
              sizeBytes: asset.sizeBytes,
              speakerDisplayName: asset.speakerDisplayName,
              status: "ready",
              storageKey: asset.fileKey,
              track: asset.track,
              uploadMode: "single",
              verifiedAt: new Date(),
            })),
          );
        }
        const sessionPatch: Partial<typeof meetingSession.$inferInsert> = {
          manifestSha256: input.manifestSha256,
        };
        if (!session.activeTranscriptRevisionId) {
          Object.assign(sessionPatch, { transcriptionError: null, transcriptionStatus: "pending" });
        }
        await tx.update(meetingSession).set(sessionPatch).where(eq(meetingSession.id, session.id));
        await tx
          .update(humanInterviewMeeting)
          .set({ recordingError: input.warning ?? null, recordingIngestedAt: new Date() })
          .where(eq(humanInterviewMeeting.id, input.meetingId));
        return {
          liveTranscriptPublished: false,
          meetingSessionId: session.id,
          organizationId: input.organizationId,
        };
      }
      if (meeting.transcriptionMode === "server_realtime") {
        const [run] = await tx
          .select()
          .from(humanTranscriptionRun)
          .where(eq(humanTranscriptionRun.meetingId, input.meetingId));
        if (run && !["failed", "needs_review"].includes(run.status)) {
          throw new Error("等待实时转录完成收尾后附加录音");
        }
      }
      const interviewers = await tx
        .select({
          liveTranscriptDraft: humanInterviewMeetingInterviewer.liveTranscriptDraft,
          name: user.name,
          role: humanInterviewMeetingInterviewer.role,
          userId: humanInterviewMeetingInterviewer.userId,
        })
        .from(humanInterviewMeetingInterviewer)
        .innerJoin(user, eq(user.id, humanInterviewMeetingInterviewer.userId))
        .where(eq(humanInterviewMeetingInterviewer.meetingId, input.meetingId))
        .orderBy(asc(humanInterviewMeetingInterviewer.role));
      const ownerId =
        meeting.createdBy ??
        interviewers.find((interviewer) => interviewer.role === "host")?.userId ??
        interviewers[0]?.userId;
      if (!(round && ownerId)) {
        throw new Error("真人复面缺少候选人轮次或会议负责人");
      }
      const meetingSessionId = crypto.randomUUID();
      const now = new Date();
      // 实时转录模式由服务端采集负责；其余模式以面试官字幕作为正式转录，无字幕才转写录音。
      const liveTranscriptSource =
        meeting.transcriptionMode === "server_realtime"
          ? null
          : selectLiveTranscriptSource(interviewers, null);
      const liveTranscriptDraft =
        liveTranscriptSource?.draft ??
        interviewers.find(
          (interviewer) => interviewer.role === "host" && interviewer.liveTranscriptDraft,
        )?.liveTranscriptDraft ??
        interviewers.find((interviewer) => interviewer.liveTranscriptDraft)?.liveTranscriptDraft ??
        null;
      await tx.insert(meetingSession).values({
        custodianId: ownerId,
        id: meetingSessionId,
        intelligenceStatus: "pending",
        liveTranscriptDraft,
        manifestSha256: input.manifestSha256,
        organizationId: input.organizationId,
        ownerId,
        savedAt: meeting.endedAt ?? now,
        startedAt: input.startedAtMs
          ? new Date(input.startedAtMs)
          : (meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt),
        status: "ready",
        title: meeting.title,
        transcriptionStatus: "pending",
        verifiedAt: now,
        visibility: "restricted",
      });
      if (!assets.length) {
        throw new Error("没有可用录音，可手动提交评价");
      }
      await tx.insert(meetingRecordingAsset).values(
        assets.map((asset) => ({
          contentType: asset.contentType,
          durationMs: asset.durationMs,
          fragmentCount: 1,
          id: crypto.randomUUID(),
          meetingId: meetingSessionId,
          recordingIdentity: asset.recordingIdentity,
          sha256: asset.assetSha256,
          sizeBytes: asset.sizeBytes,
          speakerDisplayName: asset.speakerDisplayName,
          status: "ready",
          storageKey: asset.fileKey,
          track: asset.track,
          uploadMode: "single",
          verifiedAt: now,
        })),
      );
      await tx.insert(recruitingMeetingContext).values({
        linkedAt: now,
        linkedBy: ownerId,
        meetingId: meetingSessionId,
        organizationId: input.organizationId,
        recruitingRecordId: round.interviewRecordId,
      });
      if (liveTranscriptSource) {
        await publishLiveTranscriptRevisionTx(tx, {
          actorId: ownerId,
          candidateName: round.candidateName,
          meetingSessionId,
          organizationId: input.organizationId,
          roundId: round.roundId,
          source: liveTranscriptSource,
        });
      }
      await tx
        .update(humanInterviewMeeting)
        .set({
          processingMeetingSessionId: meetingSessionId,
          recordingError: input.warning ?? null,
          recordingIngestedAt: now,
          updatedAt: now,
        })
        .where(eq(humanInterviewMeeting.id, input.meetingId));
      return {
        liveTranscriptPublished: liveTranscriptSource !== null,
        meetingSessionId,
        organizationId: input.organizationId,
      };
    });
  }

  return {
    ingestHumanInterviewRecording,
    listRecoverableHumanInterviewRecordingJobs,
    markHumanInterviewTranscriptionUnavailable,
    saveHumanInterviewRecordingProcessingError,
  };
}
