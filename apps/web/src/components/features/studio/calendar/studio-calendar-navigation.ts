import type { StudioCalendarCandidate, StudioCalendarEvent } from "@app/shared/studio-calendar";

interface StudioCalendarRecruitingRecordDestination {
  kind: "recruiting_record";
  recordId: string;
  tab: "human-interview" | "rounds";
}

interface StudioCalendarInterviewerMeetingDestination {
  inviteToken: string;
  kind: "interviewer_meeting";
}

export type StudioCalendarEventDestination =
  | StudioCalendarRecruitingRecordDestination
  | StudioCalendarInterviewerMeetingDestination;

export function studioCalendarEventDestination(
  event: Pick<StudioCalendarEvent, "kind"> &
    Partial<Pick<Extract<StudioCalendarEvent, { kind: "human" }>, "viewerInterviewerInviteToken">>,
  candidate?: StudioCalendarCandidate,
): StudioCalendarEventDestination | null {
  if (!candidate) {
    return null;
  }
  if (
    event.kind === "human" &&
    !candidate.canOpenRecruitingRecord &&
    event.viewerInterviewerInviteToken
  ) {
    return {
      inviteToken: event.viewerInterviewerInviteToken,
      kind: "interviewer_meeting",
    };
  }
  if (!candidate.canOpenRecruitingRecord) {
    return null;
  }
  return {
    kind: "recruiting_record",
    recordId: candidate.interviewRecordId,
    tab: event.kind === "ai" ? "rounds" : "human-interview",
  };
}
