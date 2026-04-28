// 中文：飞书消息路由，按 thread 类型 + 状态分派到对应 flow
// English: Feishu message router; dispatches by thread type + state to a flow
import type { Message, MessageContext, Thread } from "chat";
import { runResumeScreeningFlow } from "./flows/resume-screening";

export async function routeDM(
  thread: Thread,
  message: Message,
  context?: MessageContext,
): Promise<void> {
  // 中文：未来 Workflow 1 在此读取 getActiveJd(thread.id) 并分支到 jd-match flow
  // English: Workflow 1 will branch on getActiveJd(thread.id) here
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
