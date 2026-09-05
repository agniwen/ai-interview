import { and, asc, eq, isNotNull, isNull, notLike, or } from "drizzle-orm";
import {
  meetingRecordingAsset,
  meetingRecruitingContext,
  meetingSession,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
} from "@app/db-schema/schema";
import type { HumanInterviewRecordingJobData } from "@app/meeting-processing-queue/human-interview-recording";

import type { Database } from "@app/database";
import type { RecordingIdentity } from "@app/db-schema/human-interview-recording";

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
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          isNotNull(studioHumanInterviewMeeting.recordingTracks),
          eq(studioHumanInterviewMeeting.status, "ended"),
          isNull(studioHumanInterviewMeeting.processingMeetingSessionId),
          or(
            isNull(studioHumanInterviewMeeting.recordingError),
            notLike(
              studioHumanInterviewMeeting.recordingError,
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
        candidateDurationMs: studioHumanInterviewMeeting.candidateRecordingDurationMs,
        candidateEgressId: studioHumanInterviewMeeting.candidateRecordingEgressId,
        candidateFileKey: studioHumanInterviewMeeting.candidateRecordingFileKey,
        candidateSizeBytes: studioHumanInterviewMeeting.candidateRecordingSizeBytes,
        durationMs: studioHumanInterviewMeeting.recordingDurationMs,
        egressId: studioHumanInterviewMeeting.recordingEgressId,
        fileKey: studioHumanInterviewMeeting.recordingFileKey,
        meetingId: studioHumanInterviewMeeting.id,
        organizationId: studioHumanInterviewMeeting.organizationId,
        sizeBytes: studioHumanInterviewMeeting.recordingSizeBytes,
      })
      .from(studioHumanInterviewMeeting)
      .where(
        and(
          isNull(studioHumanInterviewMeeting.recordingTracks),
          eq(studioHumanInterviewMeeting.recordingStatus, "completed"),
          eq(studioHumanInterviewMeeting.candidateRecordingStatus, "completed"),
          isNull(studioHumanInterviewMeeting.processingMeetingSessionId),
          or(
            isNull(studioHumanInterviewMeeting.recordingError),
            notLike(
              studioHumanInterviewMeeting.recordingError,
              `${TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX}%`,
            ),
          ),
          isNotNull(studioHumanInterviewMeeting.recordingDurationMs),
          isNotNull(studioHumanInterviewMeeting.recordingEgressId),
          isNotNull(studioHumanInterviewMeeting.recordingFileKey),
          isNotNull(studioHumanInterviewMeeting.recordingSizeBytes),
          isNotNull(studioHumanInterviewMeeting.candidateRecordingDurationMs),
          isNotNull(studioHumanInterviewMeeting.candidateRecordingEgressId),
          isNotNull(studioHumanInterviewMeeting.candidateRecordingFileKey),
          isNotNull(studioHumanInterviewMeeting.candidateRecordingSizeBytes),
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
      .update(studioHumanInterviewMeeting)
      .set({
        recordingError: input.terminal
          ? `${TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX}${input.error}`
          : `录音处理中断，等待重试：${input.error}`,
        updatedAt: new Date(),
      })
      .where(eq(studioHumanInterviewMeeting.id, input.meetingId));
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
  }): Promise<{ meetingSessionId: string; organizationId: string }> {
    // oxlint-disable-next-line complexity -- legacy and identity-aware admission share one atomic meeting creation boundary.
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          candidateRecordingFileKey: studioHumanInterviewMeeting.candidateRecordingFileKey,
          candidateRecordingStatus: studioHumanInterviewMeeting.candidateRecordingStatus,
          createdAt: studioHumanInterviewMeeting.createdAt,
          createdBy: studioHumanInterviewMeeting.createdBy,
          endedAt: studioHumanInterviewMeeting.endedAt,
          processingMeetingSessionId: studioHumanInterviewMeeting.processingMeetingSessionId,
          recordingFileKey: studioHumanInterviewMeeting.recordingFileKey,
          recordingStatus: studioHumanInterviewMeeting.recordingStatus,
          recordingTracks: studioHumanInterviewMeeting.recordingTracks,
          scheduledAt: studioHumanInterviewMeeting.scheduledAt,
          startedAt: studioHumanInterviewMeeting.startedAt,
          title: studioHumanInterviewMeeting.title,
        })
        .from(studioHumanInterviewMeeting)
        .where(
          and(
            eq(studioHumanInterviewMeeting.id, input.meetingId),
            eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        throw new Error("真人复面会议不存在");
      }
      if (meeting.processingMeetingSessionId) {
        return {
          meetingSessionId: meeting.processingMeetingSessionId,
          organizationId: input.organizationId,
        };
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
      const [round, interviewers] = await Promise.all([
        tx
          .select({
            candidateName: studioInterview.candidateName,
            interviewRecordId: studioHumanInterviewRound.interviewRecordId,
          })
          .from(studioHumanInterviewMeetingRound)
          .innerJoin(
            studioHumanInterviewRound,
            eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
          )
          .innerJoin(
            studioInterview,
            eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id),
          )
          .where(eq(studioHumanInterviewMeetingRound.meetingId, input.meetingId))
          .limit(1),
        tx
          .select({
            liveTranscriptDraft: studioHumanInterviewMeetingInterviewer.liveTranscriptDraft,
            role: studioHumanInterviewMeetingInterviewer.role,
            userId: studioHumanInterviewMeetingInterviewer.userId,
          })
          .from(studioHumanInterviewMeetingInterviewer)
          .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId))
          .orderBy(asc(studioHumanInterviewMeetingInterviewer.role)),
      ]);
      const ownerId =
        meeting.createdBy ??
        interviewers.find((interviewer) => interviewer.role === "host")?.userId ??
        interviewers[0]?.userId;
      if (!(round[0] && ownerId)) {
        throw new Error("真人复面缺少候选人轮次或会议负责人");
      }
      const meetingSessionId = crypto.randomUUID();
      const now = new Date();
      const liveTranscriptDraft =
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
      const assets = input.assets ?? [
        ...(input.room ? [{ ...input.room, speakerDisplayName: null, track: "mixed" }] : []),
        ...(input.candidate
          ? [
              {
                ...input.candidate,
                speakerDisplayName: `候选人 · ${round[0].candidateName}`,
                track: "candidate",
              },
            ]
          : []),
      ];
      if (!assets.length) {
        throw new Error("没有可用录音，可手动提交评价");
      }
      await tx.insert(meetingRecordingAsset).values(
        assets.map((asset: VerifiedHumanRecordingAsset) => ({
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
      await tx.insert(meetingRecruitingContext).values({
        linkedAt: now,
        linkedBy: ownerId,
        meetingId: meetingSessionId,
        organizationId: input.organizationId,
        recruitingRecordId: round[0].interviewRecordId,
      });
      await tx
        .update(studioHumanInterviewMeeting)
        .set({
          processingMeetingSessionId: meetingSessionId,
          recordingError: input.warning ?? null,
          updatedAt: now,
        })
        .where(eq(studioHumanInterviewMeeting.id, input.meetingId));
      return { meetingSessionId, organizationId: input.organizationId };
    });
  }

  return {
    ingestHumanInterviewRecording,
    listRecoverableHumanInterviewRecordingJobs,
    markHumanInterviewTranscriptionUnavailable,
    saveHumanInterviewRecordingProcessingError,
  };
}
