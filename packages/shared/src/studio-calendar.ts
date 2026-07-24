import type {
  HumanInterviewFormat,
  HumanInterviewMeetingStatus,
} from "@arc/db-schema/studio-interviews";

export interface StudioCalendarCandidate {
  candidateName: string;
  interviewRecordId: string;
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
