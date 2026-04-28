// 中文：飞书消息路由。Bot 不在飞书内做对话；任何 inbound 消息都返回引导文案，
// 让用户去 Studio Web 操作。Bot 主要用作面试相关的通知通道（Workflow 3）。
// English: Feishu router. The bot does NOT chat inside Feishu — any inbound DM gets
// a short greeter pointing the user to the Studio Web app. The bot's primary role
// is as a notification channel for interview events (Workflow 3).
import type { Message, MessageContext, Thread } from "chat";

const STUDIO_URL = "https://interview.chainthink.cn/studio/interviews";

const GREETER_TEXT = `👋 你好！我是 AI 面试助手 bot。

我主要负责：
• 面试结果通知
• 候选人简历筛选报告推送

简历筛选、JD 管理、发起面试等操作请前往 Studio Web 端：
${STUDIO_URL}`;

export async function routeDM(
  thread: Thread,
  _message: Message,
  _context?: MessageContext,
): Promise<void> {
  await thread.post(GREETER_TEXT);
}

export async function routeGroup(
  _thread: Thread,
  _message: Message,
  _context?: MessageContext,
): Promise<void> {
  // 中文：群组路由占位；未来通知/决策按钮（Workflow 3）在此接入
  // English: group routing stub; Workflow 3 will wire interview-result notifications here
}
