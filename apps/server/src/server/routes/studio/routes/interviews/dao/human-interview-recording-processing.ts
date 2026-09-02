import { and, asc, eq, isNotNull, isNull, notLike, or } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
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

const TERMINAL_RECORDING_PROCESSING_ERROR_PREFIX = "录音处理失败：";

export async function listRecoverableHumanInterviewRecordingJobs(): Promise<
  HumanInterviewRecordingJobData[]
> {
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
  return rows.flatMap((row) =>
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
  );
}

export async function saveHumanInterviewRecordingProcessingError(input: {
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

export async function markHumanInterviewTranscriptionUnavailable(input: {
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

export async function ingestHumanInterviewRecording(input: {
  candidate: {
    assetSha256: string;
    contentType: string;
    durationMs: number;
    fileKey: string;
    sizeBytes: number;
  };
  manifestSha256: string;
  meetingId: string;
  organizationId: string;
  room: {
    assetSha256: string;
    contentType: string;
    durationMs: number;
    fileKey: string;
    sizeBytes: number;
  };
}): Promise<{ meetingSessionId: string; organizationId: string }> {
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
      meeting.recordingStatus !== "completed" ||
      meeting.recordingFileKey !== input.room.fileKey ||
      meeting.candidateRecordingStatus !== "completed" ||
      meeting.candidateRecordingFileKey !== input.candidate.fileKey
    ) {
      throw new Error("真人复面录音尚未完成或文件已变化");
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
      startedAt: meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt,
      status: "ready",
      title: meeting.title,
      transcriptionStatus: "pending",
      verifiedAt: now,
      visibility: "restricted",
    });
    await tx.insert(meetingRecordingAsset).values([
      {
        contentType: input.room.contentType,
        durationMs: input.room.durationMs,
        fragmentCount: 1,
        id: crypto.randomUUID(),
        meetingId: meetingSessionId,
        sha256: input.room.assetSha256,
        sizeBytes: input.room.sizeBytes,
        speakerDisplayName: null,
        status: "ready",
        storageKey: input.room.fileKey,
        track: "mixed",
        uploadMode: "single",
        verifiedAt: now,
      },
      {
        contentType: input.candidate.contentType,
        durationMs: input.candidate.durationMs,
        fragmentCount: 1,
        id: crypto.randomUUID(),
        meetingId: meetingSessionId,
        sha256: input.candidate.assetSha256,
        sizeBytes: input.candidate.sizeBytes,
        speakerDisplayName: `候选人 · ${round[0].candidateName}`,
        status: "ready",
        storageKey: input.candidate.fileKey,
        track: "candidate",
        uploadMode: "single",
        verifiedAt: now,
      },
    ]);
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
        recordingError: null,
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewMeeting.id, input.meetingId));
    return { meetingSessionId, organizationId: input.organizationId };
  });
}
