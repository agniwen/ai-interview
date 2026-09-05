import type {
  HumanInterviewFormat,
  HumanInterviewMeetingStatus,
  ScheduleEntryStatus,
} from "@app/db-schema/studio-interviews";
import type { InterviewSummaryStatus } from "@app/db-schema/db-enums";

export interface StudioCalendarCandidate {
  candidateName: string;
  interviewRecordId: string;
  jobDescriptionName?: string | null;
  roundId: string;
  roundLabel: string;
}

export interface StudioCalendarInterviewer {
  id: string;
  name: string;
}

export type StudioCalendarEventStatus = "scheduled" | "in_progress" | "ended";

interface StudioCalendarEventBase {
  candidates: StudioCalendarCandidate[];
  endAt: string;
  id: string;
  kind: "ai" | "human";
  startAt: string;
  status: StudioCalendarEventStatus;
  title: string;
}

interface StudioAiCalendarEventBase extends StudioCalendarEventBase {
  kind: "ai";
}

export interface StudioAiResultCalendarEvent extends StudioAiCalendarEventBase {
  conversationId: string;
  source: "result";
}

export interface StudioAiScheduledCalendarEvent extends StudioAiCalendarEventBase {
  conversationId: null;
  source: "scheduled";
}

export type StudioAiCalendarEvent = StudioAiResultCalendarEvent | StudioAiScheduledCalendarEvent;

export interface StudioHumanCalendarEvent extends StudioCalendarEventBase {
  format: HumanInterviewFormat;
  interviewers: StudioCalendarInterviewer[];
  kind: "human";
  location: string | null;
  meetingUrl: string | null;
  status: Exclude<HumanInterviewMeetingStatus, "cancelled">;
}

export type StudioCalendarEvent = StudioAiCalendarEvent | StudioHumanCalendarEvent;

export interface StudioCalendarResponse {
  events: StudioCalendarEvent[];
}

export interface StudioAiCalendarEventPreview {
  candidate: {
    id: string;
    jobDescriptionName: string | null;
    name: string;
    targetRole: string | null;
  };
  result: {
    conversationId: string;
    durationSecs: number | null;
    endedAt: string | null;
    reportStatus: InterviewSummaryStatus;
    startedAt: string | null;
    summary: string | null;
    turnCount: number;
  } | null;
  round: {
    allowTextInput: boolean;
    disconnectedAt: string | null;
    id: string;
    label: string;
    scheduledAt: string | null;
    scheduledEndAt: string | null;
    sessionStartedAt: string | null;
    status: ScheduleEntryStatus;
  };
}
