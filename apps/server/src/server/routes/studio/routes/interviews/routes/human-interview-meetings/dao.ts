import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  meetingSession,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewMeetingDetail } from "@app/shared/human-interview-meeting-detail";
import { selectHumanInterviewTranscriptRevision } from "@app/shared/human-interview-meeting-detail";
import { db } from "../../../../../../../lib/server/db";
import type { RecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { loadMeetingTranscriptRevision } from "../../../../../meetings/transcription/revision-dao";

interface MeetingDetailInput {
  candidateId: string;
  roundId: string;
  meetingId: string;
  organizationId: string;
  visibility: RecruitingVisibilityScope;
}

async function loadVisibleMeetingCandidate(input: MeetingDetailInput) {
  if (
    input.visibility.kind === "none" ||
    (input.visibility.kind === "restricted" && input.visibility.userIds.length === 0)
  ) {
    return null;
  }
  // Old meetings can contain multiple candidates. Verify every linked candidate
  // before returning a transcript that may include all of their voices.
  const linked = await db
    .select({
      candidateId: studioInterview.id,
      candidateName: studioInterview.candidateName,
      createdBy: studioInterview.createdBy,
      roundId: studioHumanInterviewRound.id,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
    )
    .innerJoin(studioInterview, eq(studioInterview.id, studioHumanInterviewRound.interviewRecordId))
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, input.meetingId),
        eq(studioHumanInterviewRound.organizationId, input.organizationId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    );
  const candidate = linked.find(
    (row) => row.roundId === input.roundId && row.candidateId === input.candidateId,
  );
  const { visibility } = input;
  if (
    !candidate ||
    (visibility.kind === "restricted" &&
      linked.some((row) => !row.createdBy || !visibility.userIds.includes(row.createdBy)))
  ) {
    return null;
  }
  return candidate;
}

function recordingNotice(
  meeting: typeof studioHumanInterviewMeeting.$inferSelect,
  finalTranscriptReady: boolean,
) {
  // Final transcription carries unresolved loss or attribution warnings.
  if (
    finalTranscriptReady &&
    meeting.recordingStatus === "completed" &&
    !meeting.recordingTracks?.some((track) => track.status === "failed")
  ) {
    return null;
  }
  if (meeting.recordingError) {
    return "录音处理未完成，当前展示已保存的内容，可能存在遗漏。";
  }
  if (meeting.recordingTracks?.some((track) => track.status === "failed")) {
    return "部分录音缺失，以下仅展示已保存的内容。";
  }
  return null;
}

function transcriptionStateBeforeProcessing(
  meeting: typeof studioHumanInterviewMeeting.$inferSelect,
) {
  if (meeting.recordingError) {
    return "failed";
  }
  const hasRecording =
    meeting.recordingStatus !== "pending" ||
    meeting.candidateRecordingStatus !== "pending" ||
    Boolean(meeting.recordingTracks?.length) ||
    Boolean(meeting.recordingEgressId || meeting.candidateRecordingEgressId) ||
    Boolean(meeting.recordingFileKey || meeting.candidateRecordingFileKey);
  return hasRecording ? "pending" : "unavailable";
}

function getTranscriptNotice(
  selection: ReturnType<typeof selectHumanInterviewTranscriptRevision>,
  hasTranscript: boolean,
  activeRevisionId: string | null,
  evaluationStatus: HumanInterviewMeetingDetail["evaluationStatus"],
) {
  if (selection.basis === "unlinked") {
    if (evaluationStatus === "generating" || evaluationStatus === "failed") {
      return "当前评价为重新生成前的旧稿，无法确认与当前转录对应。";
    }
    return "这份历史评价未记录对应的转录版本，现存转录可能与评价依据不同。";
  }
  if (selection.basis === "evaluation" && !hasTranscript) {
    return "本轮评价所依据的转录暂不可用。";
  }
  if (selection.basis === "evaluation" && selection.revisionId !== activeRevisionId) {
    return "转录后来有过修订，当前展示本轮评价所依据的对话。";
  }
  return null;
}

export async function loadHumanInterviewMeetingDetail(
  input: MeetingDetailInput,
): Promise<HumanInterviewMeetingDetail | null> {
  const candidate = await loadVisibleMeetingCandidate(input);
  if (!candidate) {
    return null;
  }
  const [row] = await db
    .select({
      activeRevisionId: meetingSession.activeTranscriptRevisionId,
      meeting: studioHumanInterviewMeeting,
      round: studioHumanInterviewRound,
      transcriptionError: meetingSession.transcriptionError,
      transcriptionState: meetingSession.transcriptionStatus,
    })
    .from(studioHumanInterviewMeeting)
    .innerJoin(
      studioHumanInterviewMeetingRound,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
    )
    .leftJoin(
      meetingSession,
      and(
        eq(meetingSession.id, studioHumanInterviewMeeting.processingMeetingSessionId),
        eq(meetingSession.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, input.meetingId),
        eq(studioHumanInterviewMeeting.organizationId, input.organizationId),
        eq(studioHumanInterviewMeeting.status, "ended"),
        eq(studioHumanInterviewRound.id, input.roundId),
        eq(studioHumanInterviewRound.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const { meeting, round } = row;
  const selection = selectHumanInterviewTranscriptRevision({
    activeRevisionId: row.activeRevisionId,
    evaluationRevisionId: round.evaluationTranscriptRevisionId,
    evaluationStatus: round.evaluationStatus,
    hasEvaluation: Boolean(round.evaluation),
  });
  const [transcript, interviewers] = await Promise.all([
    meeting.processingMeetingSessionId && selection.revisionId
      ? loadMeetingTranscriptRevision({
          meetingId: meeting.processingMeetingSessionId,
          organizationId: input.organizationId,
          revisionId: selection.revisionId,
        })
      : Promise.resolve(null),
    db
      .select({ id: user.id, name: user.name })
      .from(studioHumanInterviewMeetingInterviewer)
      .innerJoin(user, eq(user.id, studioHumanInterviewMeetingInterviewer.userId))
      .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, input.meetingId)),
  ]);
  const transcriptionNotice =
    row.transcriptionState === "ready"
      ? "转录已完成，部分内容可能缺失或发言人身份待确认。"
      : "转录处理遇到问题，已保存的内容仍可查看。";
  return {
    candidateId: candidate.candidateId,
    candidateName: candidate.candidateName,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    evaluation: round.evaluation,
    evaluationError: round.evaluationError ? "评价生成遇到问题，请联系本轮面试官处理。" : null,
    evaluationStatus: round.evaluationStatus,
    evaluationSubmittedAt: round.evaluationSubmittedAt?.toISOString() ?? null,
    feedback: round.feedback,
    interviewers,
    meetingId: meeting.id,
    outcome: round.outcome,
    recordingNotice: row.transcriptionError
      ? null
      : recordingNotice(meeting, row.transcriptionState === "ready" && Boolean(transcript)),
    roundId: round.id,
    roundLabel: round.label,
    roundStatus: round.status,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    title: meeting.title,
    transcript,
    transcriptBasis: selection.basis,
    transcriptNotice: getTranscriptNotice(
      selection,
      Boolean(transcript),
      row.activeRevisionId,
      round.evaluationStatus,
    ),
    transcriptionError: row.transcriptionError ? transcriptionNotice : null,
    transcriptionState: z
      .enum(["pending", "processing", "ready", "failed", "unavailable"])
      .parse(row.transcriptionState ?? transcriptionStateBeforeProcessing(meeting)),
  };
}
