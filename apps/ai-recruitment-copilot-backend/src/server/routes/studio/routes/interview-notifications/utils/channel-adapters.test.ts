import { toCardElement } from "chat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendInterviewNotification } from "./channel-adapters";

const mocks = vi.hoisted(() => ({
  buildSenderFromAddress: vi.fn(() => "示例科技 AI HR <noreply@example.com>"),
  postFeishuDirectCard: vi.fn(),
  resendSend: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- isolates the Resend provider boundary
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resend", () => ({
  buildSenderFromAddress: mocks.buildSenderFromAddress,
  getResendClient: () => ({ emails: { send: mocks.resendSend } }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- isolates the Feishu provider boundary
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot", () => ({
  postFeishuDirectCard: mocks.postFeishuDirectCard,
}));

const baseInput = {
  address: "recipient@example.com",
  audienceType: "candidate" as const,
  idempotencyKey: "event:email:recipient",
  payload: {
    candidateName: "张三",
    companyName: "示例科技",
    interviewLink: "http://localhost:3000/human-interview/signed-token",
    interviewStartTime: "2026-08-24T07:55:00.000Z",
    roundName: "技术复面",
    schemaVersion: 1 as const,
    timeZone: "Asia/Shanghai",
  },
  renderedContent: "请确认是否参加：http://localhost:3000/human-interview/signed-token",
  renderedSubject: "技术复面待确认",
  type: "human_interviewer_confirmation_requested" as const,
};

describe("interview notification channel adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends HTML email with a clickable CTA and keeps text as fallback", async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: "email-message-1" }, error: null });

    await expect(
      sendInterviewNotification({ ...baseInput, channel: "email", providerId: "resend" }),
    ).resolves.toEqual({ providerMessageId: "email-message-1" });

    expect(mocks.resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "示例科技 AI HR <noreply@example.com>",
        html: expect.stringContaining(">确认面试安排</a>"),
        text: baseInput.renderedContent,
      }),
      { idempotencyKey: baseInput.idempotencyKey },
    );
    expect(mocks.buildSenderFromAddress).toHaveBeenCalledWith("示例科技");
  });

  it("sends a rich Feishu card instead of a plain text message", async () => {
    mocks.postFeishuDirectCard.mockResolvedValue({ id: "feishu-message-1" });

    await expect(
      sendInterviewNotification({
        ...baseInput,
        address: "feishu-open-id",
        audienceType: "meeting_interviewer",
        channel: "feishu",
        providerId: "feishu",
      }),
    ).resolves.toEqual({ providerMessageId: "feishu-message-1" });

    expect(mocks.postFeishuDirectCard).toHaveBeenCalledOnce();
    expect(toCardElement(mocks.postFeishuDirectCard.mock.calls[0]?.[2])?.type).toBe("card");
  });

  it("keeps the Feishu provider failure visible to the notification retry policy", async () => {
    mocks.postFeishuDirectCard.mockRejectedValue(
      Object.assign(new Error("Bot has NO availability to this user."), {
        code: "permission_denied",
      }),
    );

    await expect(
      sendInterviewNotification({
        ...baseInput,
        address: "feishu-open-id",
        audienceType: "initiator_fallback",
        channel: "feishu",
        providerId: "feishu",
      }),
    ).rejects.toMatchObject({
      code: "feishu-permission_denied",
      kind: "permanent",
      message: "Bot has NO availability to this user.",
    });
  });
});
