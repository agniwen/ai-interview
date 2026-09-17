import { expect, it } from "vitest";
import { describeManualInvitationEmail } from "./timeline-manual-invitation";

const input = {
  actorImage: null,
  actorName: "测试 HR",
  audienceType: "candidate",
  channel: "email",
  error: null,
  payloadSnapshot: {
    manualAiInvitation: {
      confirmedAt: "2026-09-10T00:00:00.000Z",
      confirmedBy: "hr",
      html: "<p>邀请</p>",
      organizationId: "org",
      recipient: "candidate@example.com",
      requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
      roundId: "round",
      subject: "AI 初面邀请",
      text: "邀请",
      version: 1,
    },
    schemaVersion: 1,
    timeZone: "Asia/Shanghai",
  },
  recipientAddress: "candidate@example.com",
  recipientDisplayName: "测试候选人",
  renderedSubject: "AI 初面邀请",
  status: "sent",
  type: "ai_interview_invited",
};

it("shows the manual invitation with its recipient and subject", () => {
  const result = describeManualInvitationEmail(input);
  expect(result?.title).toBe("发送 AI 面试邀请邮件");
  expect(result?.actorName).toBe("测试 HR");
  expect(result?.description).toContain("测试候选人（candidate@example.com）");
  expect(result?.metadata).toContainEqual({ label: "邮件主题", value: "AI 初面邀请" });
  expect(result?.metadata).toContainEqual({ label: "触发方式", value: "人工确认发送" });
});

it.each([
  { type: "ai_report_ready" },
  { type: "human_candidate_invitation_requested" },
  { type: "ai_interview_completed" },
  { channel: "feishu" },
  { audienceType: "initiator_fallback" },
  { payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" } },
])("leaves existing notifications unchanged: %o", (override) => {
  expect(describeManualInvitationEmail({ ...input, ...override })).toBeNull();
});

it.each(["failed", "dead", "unknown"])("keeps %s visible instead of showing success", (status) => {
  const result = describeManualInvitationEmail({ ...input, error: "测试失败原因", status });
  expect(result?.tone).toBe("danger");
  expect(result?.metadata).toContainEqual({ label: "失败原因", value: "测试失败原因" });
  expect(result?.title).not.toBe("发送 AI 面试邀请邮件");
});
