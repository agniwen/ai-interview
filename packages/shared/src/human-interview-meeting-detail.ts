import type {
  HumanInterviewReviewRecord,
  HumanInterviewRoundRecord,
} from "./studio-pipeline-stages";

export interface HumanInterviewMeetingDetail extends Pick<
  HumanInterviewReviewRecord,
  | "evaluation"
  | "evaluationStatus"
  | "evaluationError"
  | "outcome"
  | "roundStatus"
  | "transcript"
  | "transcriptionError"
  | "recordingNotice"
> {
  candidateId: string;
  candidateName: string;
  roundId: string;
  roundLabel: string;
  meetingId: string;
  title: string;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  interviewers: { id: string; name: string }[];
  evaluationSubmittedAt: string | null;
  feedback: HumanInterviewRoundRecord["feedback"];
  transcriptBasis: "evaluation" | "unlinked" | "current";
  transcriptNotice: string | null;
  transcriptionState: HumanInterviewReviewRecord["transcriptionState"] | "unavailable";
}

/** Cancelled attempts must not hide a replacement meeting. */
export function findHumanInterviewRoundMeeting<
  T extends {
    id: string;
    createdAt: string;
    status: string;
    rounds: { roundId: string }[];
  },
>(meetings: T[], roundId: string): T | null {
  return (
    meetings
      .filter((meeting) => meeting.rounds.some((round) => round.roundId === roundId))
      .toSorted(
        (a, b) =>
          Number(a.status === "cancelled") - Number(b.status === "cancelled") ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      )[0] ?? null
  );
}

export function selectHumanInterviewTranscriptRevision(input: {
  hasEvaluation: boolean;
  evaluationStatus: HumanInterviewReviewRecord["evaluationStatus"];
  evaluationRevisionId: string | null;
  activeRevisionId: string | null;
}) {
  // While regenerating (including a failed attempt), the pointer belongs to the
  // new job but the stored evaluation may still be the previous draft.
  if (
    input.hasEvaluation &&
    input.evaluationRevisionId &&
    (input.evaluationStatus === "draft" || input.evaluationStatus === "submitted")
  ) {
    return { basis: "evaluation" as const, revisionId: input.evaluationRevisionId };
  }
  return {
    basis: input.hasEvaluation ? ("unlinked" as const) : ("current" as const),
    revisionId: input.activeRevisionId,
  };
}
