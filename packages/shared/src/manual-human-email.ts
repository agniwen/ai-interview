import { z } from "zod";
import { interviewNotificationPayloadSnapshotSchema } from "@app/db-schema/interview-notifications";

export const manualHumanEmailTypeSchema = z.enum([
  "human_candidate_invitation_requested",
  "human_interview_confirmed",
  "human_interview_rescheduled",
  "human_interview_cancelled",
  "human_interview_reminder",
]);
export type ManualHumanEmailType = z.infer<typeof manualHumanEmailTypeSchema>;
export const manualHumanEmailLabels = {
  human_candidate_invitation_requested: "面试邀请",
  human_interview_cancelled: "面试取消通知",
  human_interview_confirmed: "面试安排确认",
  human_interview_reminder: "面试开始提醒",
  human_interview_rescheduled: "面试改期通知",
} satisfies Record<ManualHumanEmailType, string>;

interface ManualHumanEmailContext {
  roundStatus: string;
  meetingStatus: string;
  candidateStatus: string;
  scheduledAt: Date | null;
  validUntil: Date | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  hasCurrentReschedule: boolean;
  hasValidLink: boolean;
  now: Date;
}

export function manualHumanEmailBlockedReason(input: ManualHumanEmailContext): string | null {
  if (input.roundStatus === "completed" || input.meetingStatus === "ended") {
    return "面试已结束，不能发送邀请或安排通知。";
  }
  if (input.roundStatus === "cancelled" || input.meetingStatus === "cancelled") {
    return null;
  }
  if (input.startedAt || input.meetingStatus === "in_progress") {
    return "会议已实际开始，不能再发送面试邀请或开始提醒。";
  }
  if (input.roundStatus !== "pending" || input.meetingStatus !== "scheduled") {
    return "当前面试状态不支持发送通知。";
  }
  if (input.candidateStatus === "declined") {
    return "候选人已拒绝本次面试，不能发送邀请或安排通知。";
  }
  if (!input.scheduledAt || !input.validUntil || input.validUntil <= input.scheduledAt) {
    return "面试时间不完整或无效，请先完善面试安排。";
  }
  if (input.validUntil <= input.now) {
    return "已超过本次面试的结束时间，请先调整面试时间，再发送通知。";
  }
  if (input.candidateStatus === "expired" || !input.expiresAt || input.expiresAt <= input.now) {
    return "邀请已失效，请重新生成有效邀请后再发送。";
  }
  if (!input.hasValidLink) {
    return "当前邀请链接不可用，请重新生成有效邀请后再发送。";
  }
  if (!["pending", "sent", "accepted"].includes(input.candidateStatus)) {
    return "当前候选人响应状态不支持发送通知。";
  }
  return null;
}

export function availableManualHumanEmails(input: ManualHumanEmailContext): ManualHumanEmailType[] {
  if (input.roundStatus === "completed" || input.meetingStatus === "ended") {
    return [];
  }
  if (input.roundStatus === "cancelled" || input.meetingStatus === "cancelled") {
    return ["human_interview_cancelled"];
  }
  if (manualHumanEmailBlockedReason(input)) {
    return [];
  }
  const types: ManualHumanEmailType[] = [];
  if (input.hasCurrentReschedule) {
    types.push("human_interview_rescheduled");
  }
  if (input.candidateStatus === "accepted") {
    types.push("human_interview_confirmed");
    if (input.scheduledAt && input.scheduledAt > input.now) {
      types.push("human_interview_reminder");
    }
  } else if (["pending", "sent"].includes(input.candidateStatus)) {
    types.push("human_candidate_invitation_requested");
  }
  return types;
}

export function isConfirmedManualHumanEmail(
  event: {
    type: string;
    actorUserId: string | null;
    organizationId: string;
    humanMeetingId: string | null;
    humanRoundId: string | null;
    payloadSnapshot: unknown;
  },
  delivery: {
    audienceType: string | null;
    channel: string | null;
    recipientAddress: string | null;
    renderedSubject: string | null;
    renderedContent: string | null;
  },
) {
  const parsed = interviewNotificationPayloadSnapshotSchema.safeParse(event.payloadSnapshot);
  const confirmation = parsed.success ? parsed.data.manualHumanEmail : null;
  return Boolean(
    confirmation &&
    event.type === confirmation.eventType &&
    event.actorUserId === confirmation.confirmedBy &&
    event.organizationId === confirmation.organizationId &&
    event.humanMeetingId === confirmation.meetingId &&
    event.humanRoundId === confirmation.roundId &&
    delivery.audienceType === "candidate" &&
    delivery.channel === "email" &&
    delivery.recipientAddress === confirmation.recipient &&
    delivery.renderedSubject === confirmation.subject &&
    delivery.renderedContent === confirmation.text,
  );
}
