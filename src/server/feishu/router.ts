// 中文：飞书消息路由，按 thread 类型 + 状态分派到对应 flow
// English: Feishu message router; dispatches by thread type + state to a flow
import type { Message, MessageContext, Thread } from "chat";
import { JdListCard } from "./cards/jd-list-card";
import { JdStatusCard } from "./cards/jd-status-card";
import { OAuthBindingCard } from "./cards/oauth-binding-card";
import { parseJdCommand } from "./commands/jd";
import { listJobDescriptionsForHr } from "./_lib/list-job-descriptions";
import { runJdMatchFlow } from "./flows/jd-match";
import { runResumeScreeningFlow } from "./flows/resume-screening";
import { requireBinding } from "./identity/require-binding";
import { clearActiveJd, getActiveJd } from "./session/active-jd";

function isPdfAttachment(att: NonNullable<Message["attachments"]>[number]): boolean {
  if (att.type !== "file") {
    return false;
  }
  const mime = att.mimeType ?? "";
  const isPdfByName = att.name?.toLowerCase().endsWith(".pdf") ?? false;
  return mime === "application/pdf" || isPdfByName;
}

function getAppUrl(): string {
  return process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://example.com";
}

async function handleJdList(thread: Thread, openId: string): Promise<void> {
  const binding = await requireBinding(openId);
  if ("unbound" in binding) {
    await thread.post(OAuthBindingCard({ appUrl: getAppUrl() }) as never);
    return;
  }
  const { records, truncated } = await listJobDescriptionsForHr(binding.userId);
  await thread.post(JdListCard({ records, truncated }) as never);
}

async function handleJdClear(thread: Thread, openId: string): Promise<void> {
  const binding = await requireBinding(openId);
  if ("unbound" in binding) {
    await thread.post(OAuthBindingCard({ appUrl: getAppUrl() }) as never);
    return;
  }
  await clearActiveJd(thread.id);
  await thread.post(JdStatusCard({ kind: "cleared" }) as never);
}

export async function routeDM(
  thread: Thread,
  message: Message,
  context?: MessageContext,
): Promise<void> {
  // 中文：1) 命令优先（/jd, /jd list, /jd clear），需要 OAuth 绑定
  // English: 1) commands first (/jd family); gated by OAuth binding
  const command = parseJdCommand(message.text ?? "");
  if (command) {
    const openId = (message.author as { userId?: string }).userId ?? "";
    await (command.kind === "list" ? handleJdList(thread, openId) : handleJdClear(thread, openId));
    return;
  }

  // 中文：2) 当前消息带 PDF 且有激活 JD → JD 匹配流程
  // English: 2) PDF + active JD → jd-match flow
  const hasPdf = (message.attachments ?? []).some(isPdfAttachment);
  if (hasPdf) {
    const activeJdId = await getActiveJd(thread.id);
    if (activeJdId) {
      await runJdMatchFlow(thread, message, context, activeJdId);
      return;
    }
  }

  // 中文：3) 兜底：通用简历筛选
  // English: 3) fallback: generic resume screening
  await runResumeScreeningFlow(thread, message, context);
}

export async function routeGroup(
  _thread: Thread,
  _message: Message,
  _context?: MessageContext,
): Promise<void> {
  // 中文：群组路由占位，Workflow 3 的 /bind 命令在此接入
  // English: group routing stub; Workflow 3 wires /bind here
}
