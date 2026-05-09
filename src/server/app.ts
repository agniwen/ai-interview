import type { Env } from "@/server/type";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { getFeishuBot } from "./feishu/bot";
import { betterAuthMiddleware } from "./middlewares/better-auth";
import { agentRouter } from "./routes/agent/route";
import { chatRouter } from "./routes/chat/route";
import { interviewRouter } from "./routes/interview/route";
import { livekitRouter } from "./routes/livekit/route";
import { resumeRouter } from "./routes/resume/route";
import { skillRouter } from "./routes/skill/route";
import { studioRouter } from "./routes/studio/route";

// 中文：app.ts 只做 CORS、better-auth handler、顶层路由挂载。
// 业务中间件（auth/admin）请在各自 route 内部声明，不要在这里 .use(...)。
// English: app.ts is mount-only — CORS, the better-auth handler, and top-level
// .route(...) calls. Business middleware (auth/admin) belongs inside each
// router; do NOT add per-feature .use(...) lines here.
export const app = new Hono<Env>()
  .use(
    "/api/auth/*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["POST", "GET", "OPTIONS"],
      credentials: true,
      exposeHeaders: ["Content-Length"],
      maxAge: 600,
      origin: "*",
    }),
  )
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  .use(betterAuthMiddleware)
  .basePath("/api")
  .post("/feishu/webhook", async (c) => {
    const bot = getFeishuBot();
    const body = await c.req.text();
    const rebuilt = new Request(c.req.raw.url, {
      body,
      headers: c.req.raw.headers,
      method: "POST",
    });
    return bot.webhooks.feishu(rebuilt);
  })
  .post("/feishu-jiguang-hr/webhook", async (c) => {
    const bot = getFeishuBot("feishu-jiguang-hr");
    const body = await c.req.text();
    const rebuilt = new Request(c.req.raw.url, {
      body,
      headers: c.req.raw.headers,
      method: "POST",
    });
    return bot.webhooks.feishu(rebuilt);
  })
  .route("/agent", agentRouter)
  .route("/livekit", livekitRouter)
  .route("/chat", chatRouter)
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/skill", skillRouter)
  .route("/studio", studioRouter);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
