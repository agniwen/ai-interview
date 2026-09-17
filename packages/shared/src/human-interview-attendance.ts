import type { HumanInterviewMeetingStatus } from "@app/db-schema/studio-interviews";

export type HumanInterviewParticipantPresence = "not_joined" | "present" | "left";
export type HumanInterviewAttendanceStatus =
  | "pending"
  | "waiting_candidate"
  | "waiting_interviewer"
  | "in_progress"
  | "not_held"
  | "ended"
  | "cancelled";

interface ParticipantTiming {
  joinedAt: Date | string | null;
  leftAt: Date | string | null;
}

export interface HumanInterviewAttendanceMeeting {
  establishedAt: Date | string | null;
  interviewers: (ParticipantTiming & { role: "host" | "interviewer" | "observer" })[];
  rounds: ParticipantTiming[];
  scheduledAt: Date | string | null;
  status: HumanInterviewMeetingStatus;
  validUntil: Date | string | null;
}

export interface HumanInterviewAttendanceDescription {
  note: string | null;
  status: HumanInterviewAttendanceStatus;
}

function timestamp(value: Date | string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  const valueOf = parsed.getTime();
  return Number.isNaN(valueOf) ? null : valueOf;
}

export function humanInterviewParticipantPresence(
  participant: ParticipantTiming,
): HumanInterviewParticipantPresence {
  const joinedAt = timestamp(participant.joinedAt);
  if (joinedAt === null) {
    return "not_joined";
  }
  const leftAt = timestamp(participant.leftAt);
  return leftAt === null || joinedAt > leftAt ? "present" : "left";
}

export function describeHumanInterviewAttendance(
  meeting: HumanInterviewAttendanceMeeting,
  now: Date = new Date(),
) {
  if (meeting.status === "cancelled") {
    return { note: null, status: "cancelled" } satisfies HumanInterviewAttendanceDescription;
  }
  if (meeting.status === "not_held") {
    return {
      note: "会议有效时间已结束，候选人与面试官未正常会合。",
      status: "not_held",
    } satisfies HumanInterviewAttendanceDescription;
  }
  if (meeting.status === "ended") {
    return { note: null, status: "ended" } satisfies HumanInterviewAttendanceDescription;
  }
  const validUntil = timestamp(meeting.validUntil);
  if (!meeting.establishedAt && validUntil !== null && now.getTime() >= validUntil) {
    return {
      note: "会议有效时间已结束，候选人与面试官未正常会合。",
      status: "not_held",
    } satisfies HumanInterviewAttendanceDescription;
  }
  const candidatePresent = meeting.rounds.some(
    (round) => humanInterviewParticipantPresence(round) === "present",
  );
  const interviewerPresent = meeting.interviewers.some(
    (interviewer) =>
      interviewer.role !== "observer" &&
      humanInterviewParticipantPresence(interviewer) === "present",
  );
  if (candidatePresent && interviewerPresent) {
    return { note: null, status: "in_progress" } satisfies HumanInterviewAttendanceDescription;
  }
  if (candidatePresent) {
    return {
      note: null,
      status: "waiting_interviewer",
    } satisfies HumanInterviewAttendanceDescription;
  }
  if (interviewerPresent) {
    return {
      note: null,
      status: "waiting_candidate",
    } satisfies HumanInterviewAttendanceDescription;
  }
  if (meeting.establishedAt) {
    return {
      note: "参会人员当前均已离会，会议尚未结束。",
      status: "in_progress",
    } satisfies HumanInterviewAttendanceDescription;
  }

  const scheduledAt = timestamp(meeting.scheduledAt);
  const hasStarted = scheduledAt !== null && now.getTime() >= scheduledAt;
  return {
    note: hasStarted ? "已到面试时间，候选人与面试官均未入会。" : null,
    status: "pending",
  } satisfies HumanInterviewAttendanceDescription;
}

export const humanInterviewAttendanceStatusMeta = {
  cancelled: { label: "已取消", tone: "outline" },
  ended: { label: "已结束", tone: "outline" },
  in_progress: { label: "正常进行", tone: "success" },
  not_held: { label: "未召开", tone: "danger" },
  pending: { label: "待开始", tone: "info" },
  waiting_candidate: { label: "等待候选人", tone: "warning" },
  waiting_interviewer: { label: "等待面试官", tone: "warning" },
} as const satisfies Record<
  HumanInterviewAttendanceStatus,
  { label: string; tone: "danger" | "info" | "outline" | "success" | "warning" }
>;
