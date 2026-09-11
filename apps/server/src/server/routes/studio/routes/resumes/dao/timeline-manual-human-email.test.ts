import { expect, it } from "vitest";
import { describeManualHumanEmail } from "./timeline-manual-human-email";

const input = {
  actorImage: null,
  actorName: "HR",
  audienceType: "candidate",
  channel: "email",
  error: null,
  payloadSnapshot: {
    manualHumanEmail: {
      confirmedAt: "2026-09-10T00:00:00.000Z",
      confirmedBy: "hr",
      eventType: "human_interview_rescheduled",
      meetingId: "meeting",
      organizationId: "org",
      recipient: "candidate@example.com",
      requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
      roundId: "round",
      subject: "改期通知",
      text: "改期",
      version: 1,
    },
    roundName: "技术一面",
    schemaVersion: 1,
    timeZone: "Asia/Shanghai",
  },
  recipientAddress: "candidate@example.com",
  recipientDisplayName: "候选人",
  renderedSubject: "改期通知",
  status: "sent",
  type: "human_interview_rescheduled",
};
it("records who sent which notification to which email", () => {
  const result = describeManualHumanEmail(input);
  expect(result?.actorName).toBe("HR");
  expect(result?.title).toBe("发送面试改期通知邮件");
  expect(result?.metadata).toContainEqual({ label: "面试名称", value: "技术一面" });
  expect(result?.metadata).toContainEqual({ label: "收件邮箱", value: "candidate@example.com" });
  expect(result?.metadata).toContainEqual({ label: "触发方式", value: "人工确认发送" });
});
it.each([
  { payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" } },
  { type: "ai_report_ready" },
  { channel: "feishu" },
  { audienceType: "meeting_interviewer" },
])("leaves older and internal notifications untouched %o", (change) => {
  expect(describeManualHumanEmail({ ...input, ...change })).toBeNull();
});
it("shows failures without labelling them sent", () => {
  const result = describeManualHumanEmail({ ...input, error: "收件邮箱无效", status: "dead" });
  expect(result?.tone).toBe("danger");
  expect(result?.title).toContain("发送失败");
  expect(result?.metadata).toContainEqual({ label: "失败原因", value: "收件邮箱无效" });
});
