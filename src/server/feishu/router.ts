// 中文：飞书消息路由。Bot 不在飞书内做对话；任何 inbound 消息都返回引导文案，
// 让用户去 Studio Web 操作。Bot 主要用作面试相关的通知通道（Workflow 3）。
// English: Feishu router. The bot does NOT chat inside Feishu — any inbound DM gets
// a short greeter pointing the user to the Studio Web app. The bot's primary role
// is as a notification channel for interview events (Workflow 3).
import type { Message, MessageContext, Thread } from "chat";
import { GreeterCard } from "./greeter-card";

// 中文：飞书 web_app applink — 直接以「网页应用」形态在飞书内打开，appId 见开放平台
// English: Feishu web_app applink — opens the registered web app inside Feishu;
// appId comes from the Feishu open platform.
const GREETER_LINKS = [
  {
    label: "极光矩阵有限公司主体入口",
    url: "https://applink.feishu.cn/client/web_app/open?appId=cli_a955211781785bd8",
  },
  {
    label: "极光矩阵主体入口",
    url: "https://applink.feishu.cn/client/web_app/open?appId=cli_a97aa896aab85bc2",
  },
];

export async function routeDM(
  thread: Thread,
  _message: Message,
  _context?: MessageContext,
): Promise<void> {
  await thread.post(GreeterCard({ links: GREETER_LINKS }) as never);
}

export async function routeGroupMention(
  thread: Thread,
  _message: Message,
  _context?: MessageContext,
): Promise<void> {
  // 中文：群里 @bot 等同于 DM，给同一份引导文案；后续 Workflow 3 的通知/决策按钮也在群里发出
  // English: @bot in a group gets the same greeter as DM; Workflow 3 notifications + decision
  // buttons will also live in groups but are pushed by the server, not triggered by chat.
  await thread.post(GreeterCard({ links: GREETER_LINKS }) as never);
}
