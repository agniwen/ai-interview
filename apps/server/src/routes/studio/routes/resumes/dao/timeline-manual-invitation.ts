import {
  interviewNotificationPayloadSnapshotSchema,
  interviewNotificationDeliveryStatusSchema,
} from "@app/db-schema/interview-notifications";
import type { InterviewNotificationDeliveryStatus } from "@app/db-schema/interview-notifications";
import type { CandidateTimelineEventTone } from "@app/shared/studio-resumes";

const statuses = {
  cancelled: "已取消发送",
  dead: "发送失败，需人工处理",
  failed: "发送失败",
  pending: "待发送",
  sending: "发送中",
  sent: "已发送",
  unknown: "发送结果待核实",
} satisfies Record<InterviewNotificationDeliveryStatus, string>;

/** 仅补充本期人工 AI 邀请；返回 null 时保持原有活动记录展示。 */
export function describeManualInvitationEmail(input: {
  actorName: string | null;
  actorImage: string | null;
  type: string;
  status: string;
  channel: string | null;
  audienceType: string | null;
  recipientAddress: string | null;
  recipientDisplayName: string | null;
  renderedSubject: string | null;
  error: string | null;
  payloadSnapshot: unknown;
}) {
  if (
    input.type !== "ai_interview_invited" ||
    input.channel !== "email" ||
    input.audienceType !== "candidate"
  ) {
    return null;
  }
  const parsed = interviewNotificationPayloadSnapshotSchema.safeParse(input.payloadSnapshot);
  if (!parsed.success || !parsed.data.manualAiInvitation) {
    return null;
  }
  const parsedStatus = interviewNotificationDeliveryStatusSchema.safeParse(input.status);
  const status = parsedStatus.success ? statuses[parsedStatus.data] : "状态待核实";
  const recipient = input.recipientDisplayName || parsed.data.candidateName || "候选人";
  const title = input.status === "sent" ? "发送 AI 面试邀请邮件" : `AI 面试邀请邮件：${status}`;
  const metadata = [
    { label: "候选人", value: recipient },
    { label: "收件邮箱", value: input.recipientAddress },
    { label: "邮件主题", value: input.renderedSubject },
    { label: "渠道", value: "邮件" },
    { label: "发送状态", value: status },
    { label: "触发方式", value: "人工确认发送" },
    { label: "失败原因", value: input.error },
  ].flatMap((item) => (item.value ? [{ label: item.label, value: item.value }] : []));
  let tone: CandidateTimelineEventTone = "muted";
  if (input.status === "sent") {
    tone = "success";
  } else if (["failed", "dead", "unknown"].includes(input.status)) {
    tone = "danger";
  }
  return {
    actorImage: input.actorImage,
    actorName: input.actorName,
    description: `收件人：${recipient}（${input.recipientAddress ?? "邮箱未记录"}）`,
    kind: "email" as const,
    metadata,
    title,
    tone,
  };
}
