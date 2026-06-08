import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

type FeishuProviderId = "feishu" | "feishu-jiguang-hr";

// 中文：飞书 bot webhook 入口。两个不同 appId 的 bot 各自一个 URL，由
// Feishu 开放平台侧配置，路径不能改动；因此这里在同一个 router 里直接保留
// 两个完整路径，由 app.ts 以 `.route("/", feishuRouter)` 的形式挂到根。
// English: Feishu bot webhook entry. Two different bot apps point at distinct
// URLs registered in the Feishu open platform — the paths are external
// contract and must not change. Both endpoints live in the same router and
// the router is mounted at root in app.ts via `.route("/", feishuRouter)`.
async function dispatchFeishuWebhook(request: Request, provider?: FeishuProviderId) {
  const { getFeishuBot } = await import("./utils/bot");
  const bot = getFeishuBot(provider);
  const body = await request.text();
  const rebuilt = new Request(request.url, {
    body,
    headers: request.headers,
    method: "POST",
  });
  return bot.webhooks.feishu(rebuilt);
}

export const feishuRouter = factory
  .createApp()
  .post("/feishu/webhook", (c) => dispatchFeishuWebhook(c.req.raw))
  .post("/feishu-jiguang-hr/webhook", (c) => dispatchFeishuWebhook(c.req.raw, "feishu-jiguang-hr"));
