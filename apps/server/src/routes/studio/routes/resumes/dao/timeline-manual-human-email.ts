import { interviewNotificationPayloadSnapshotSchema } from "@app/db-schema/interview-notifications";
import { manualHumanEmailLabels } from "@app/shared/manual-human-email";
import type { CandidateTimelineEventTone } from "@app/shared/studio-resumes";
import type { describeManualInvitationEmail } from "./timeline-manual-invitation";

/** Only the new explicitly confirmed human emails receive this presentation. */
export function describeManualHumanEmail(
  input: Parameters<typeof describeManualInvitationEmail>[0],
) {
  const parsed = interviewNotificationPayloadSnapshotSchema.safeParse(input.payloadSnapshot);
  const manual = parsed.success ? parsed.data.manualHumanEmail : null;
  if (
    !manual ||
    input.type !== manual.eventType ||
    input.channel !== "email" ||
    input.audienceType !== "candidate"
  ) {
    return null;
  }
  const status = {
    cancelled: "已取消发送",
    dead: "发送失败，需人工处理",
    failed: "发送失败",
    pending: "待发送",
    sending: "发送中",
    sent: "已发送",
    unknown: "发送结果待核实",
  } as const;
  const state = Object.entries(status).find(([key]) => key === input.status)?.[1] ?? "状态待核实";
  const label = manualHumanEmailLabels[manual.eventType];
  const recipient = input.recipientDisplayName || "候选人";
  let tone: CandidateTimelineEventTone = "muted";
  if (input.status === "sent") {
    tone = "success";
  } else if (["failed", "dead", "unknown"].includes(input.status)) {
    tone = "danger";
  }
  return {
    actorImage: input.actorImage,
    actorName: input.actorName,
    description: `收件人：${recipient}（${input.recipientAddress ?? manual.recipient}）`,
    kind: "email" as const,
    metadata: [
      { label: "通知类型", value: label },
      { label: "面试名称", value: parsed.success ? parsed.data.roundName : null },
      { label: "收件邮箱", value: input.recipientAddress ?? manual.recipient },
      { label: "邮件主题", value: input.renderedSubject },
      { label: "发送状态", value: state },
      { label: "触发方式", value: "人工确认发送" },
      { label: "失败原因", value: input.error },
    ].flatMap((item) => (item.value ? [{ label: item.label, value: item.value }] : [])),
    title: input.status === "sent" ? `发送${label}邮件` : `${label}邮件：${state}`,
    tone,
  };
}
