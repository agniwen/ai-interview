import { buildSenderFromAddress, getResendClient } from "@app/server/lib/server/resend";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAppBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_BASE_URL 或 BETTER_AUTH_URL 未配置");
  }
  return value.replace(/\/$/, "");
}

export function buildWorkspaceInviteUrl(code: string): string {
  return `${getAppBaseUrl()}/join/${encodeURIComponent(code)}`;
}

export function renderWorkspaceInviteLinkEmail(input: {
  inviterName: string;
  invitationUrl: string;
  workspaceName: string;
}) {
  const inviterName = input.inviterName.trim() || "工作区管理员";
  const workspaceName = input.workspaceName.trim() || "招聘工作区";
  const subject = `${inviterName} 邀请你加入 ${workspaceName}`;
  const text = `${inviterName} 邀请你加入 ${workspaceName}。请打开邀请链接并使用飞书登录：${input.invitationUrl}`;
  const html = `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 16px;">
                <div style="font-size:22px;font-weight:700;line-height:30px;">工作区成员邀请</div>
                <p style="margin:16px 0 0;font-size:15px;line-height:24px;color:#4b5563;">
                  ${escapeHtml(inviterName)} 邀请你加入 <strong>${escapeHtml(workspaceName)}</strong>。
                </p>
                <p style="margin:8px 0 0;font-size:14px;line-height:22px;color:#6b7280;">
                  点击下方按钮后使用飞书登录，即可加入工作区。
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;text-align:center;">
                <a href="${escapeHtml(input.invitationUrl)}" style="display:inline-block;border-radius:8px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;line-height:22px;padding:12px 24px;text-decoration:none;">加入工作区</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { html, subject, text };
}

type SendEmail = ReturnType<typeof getResendClient>["emails"]["send"];

export async function sendWorkspaceInviteLinkEmail(
  input: {
    code: string;
    email: string;
    inviterName: string;
    inviteLinkId: string;
    workspaceName: string;
  },
  dependencies: {
    sendEmail?: SendEmail;
  } = {},
): Promise<void> {
  const invitationUrl = buildWorkspaceInviteUrl(input.code);
  const content = renderWorkspaceInviteLinkEmail({
    invitationUrl,
    inviterName: input.inviterName,
    workspaceName: input.workspaceName,
  });
  const resend = dependencies.sendEmail ? null : getResendClient();
  const sendEmail = dependencies.sendEmail ?? resend?.emails.send.bind(resend.emails);
  if (!sendEmail) {
    throw new Error("邮件发送客户端不可用");
  }
  const result = await sendEmail(
    {
      from: buildSenderFromAddress(input.workspaceName),
      html: content.html,
      subject: content.subject,
      text: content.text,
      to: input.email,
    },
    { idempotencyKey: `workspace-invite-link:${input.inviteLinkId}:${input.email}` },
  );
  if (result.error) {
    throw new Error(result.error.message || "工作区邀请邮件发送失败");
  }
  if (!result.data?.id) {
    throw new Error("邮件供应商未返回消息 ID");
  }
}
