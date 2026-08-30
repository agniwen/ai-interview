import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkspaceInviteUrl,
  renderWorkspaceInviteLinkEmail,
  sendWorkspaceInviteLinkEmail,
} from "./email";

const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const ORIGINAL_FROM = process.env.RESEND_FROM;

afterEach(() => {
  process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  process.env.RESEND_FROM = ORIGINAL_FROM;
});

describe("workspace invite link email", () => {
  it("builds a Feishu-login workspace join link", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://app.example.com/";
    expect(buildWorkspaceInviteUrl("abc/123")).toBe("https://app.example.com/join/abc%2F123");
  });

  it("renders a button without exposing the raw URL as visible HTML text", () => {
    const content = renderWorkspaceInviteLinkEmail({
      invitationUrl: "https://app.example.com/join/link-code",
      inviterName: "肥仔<script>",
      workspaceName: "测试工作区",
    });
    expect(content.html).toContain(">加入工作区</a>");
    expect(content.html).toContain('href="https://app.example.com/join/link-code"');
    expect(content.html).not.toContain(">https://app.example.com/join/link-code<");
    expect(content.html).toContain("肥仔&lt;script&gt;");
    expect(content.text).toContain("使用飞书登录");
  });

  it("sends the invitation with a stable idempotency key", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://app.example.com";
    process.env.RESEND_FROM = "noreply@example.com";
    const sendEmail = vi.fn().mockResolvedValue({ data: { id: "email-1" }, error: null });
    await sendWorkspaceInviteLinkEmail(
      {
        code: "link-code",
        email: "colleague@example.com",
        inviteLinkId: "wil-1",
        inviterName: "肥仔",
        workspaceName: "测试工作区",
      },
      { sendEmail },
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "肥仔 邀请你加入 测试工作区",
        to: "colleague@example.com",
      }),
      { idempotencyKey: "workspace-invite-link:wil-1:colleague@example.com" },
    );
  });
});
