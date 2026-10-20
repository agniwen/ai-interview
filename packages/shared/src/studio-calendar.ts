import type {
  HumanInterviewEvaluationRating,
  HumanInterviewFormat,
  HumanInterviewMeetingStatus,
  HumanInterviewRoundOutcome,
  ScheduleEntryStatus,
} from "@app/db-schema/studio-interviews";
import type { InterviewSummaryStatus } from "@app/db-schema/db-enums";

/**
 * 轮次的决定性评价结论：通过 / 未通过 / 待定，`none` 表示还没有任何已提交评价。
 * / A round's decisive evaluation conclusion; `none` means nothing has been submitted yet.
 */
export type StudioCalendarEvaluationConclusion = HumanInterviewRoundOutcome | "none";

export interface StudioCalendarCandidate {
  /** 简历头像版本，配合招聘记录 id 取头像；没有头像时为 null。/ Resume headshot version, if any. */
  candidateAvatarVersion: string | null;
  canOpenRecruitingRecord: boolean;
  candidateName: string;
  evaluationConclusion: StudioCalendarEvaluationConclusion;
  interviewRecordId: string;
  jobDescriptionId: string | null;
  jobDescriptionName?: string | null;
  roundId: string;
  roundLabel: string;
}

export interface StudioCalendarInterviewer {
  avatarUrl: string | null;
  id: string;
  name: string;
}

export type StudioCalendarEventStatus = "scheduled" | "in_progress" | "ended" | "not_held";

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
  viewerInterviewerInviteToken: string | null;
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

/** 一位评价者（真人面试官或 AI）在某轮次上的评价。/ One evaluator's view of a round. */
export interface StudioCalendarEvaluator {
  avatarUrl: string | null;
  id: string;
  kind: "ai" | "human";
  name: string;
  /** `null` 表示尚未给出结论。/ `null` until the evaluator has given a conclusion. */
  outcome: HumanInterviewRoundOutcome | null;
  overallEvaluation: string | null;
  rating: HumanInterviewEvaluationRating | null;
  risks: string | null;
  /** 没有评价内容时的说明，例如“报告生成中”。/ Explains an evaluator without content. */
  statusText: string | null;
  strengths: string | null;
  submittedAt: string | null;
}

export interface StudioCalendarRoundEvaluation {
  conclusion: StudioCalendarEvaluationConclusion;
  evaluators: StudioCalendarEvaluator[];
  roundId: string;
}
