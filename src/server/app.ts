import type { Env } from "@/server/type";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { getFeishuBot } from "./feishu/bot";
import { adminMiddleware } from "./middlewares/admin";
import { authMiddleware } from "./middlewares/auth";
import { betterAuthMiddleware } from "./middlewares/better-auth";
import { agentRouter } from "./routes/agent/route";
import { chatRouter } from "./routes/chat/route";
import { interviewRouter, studioInterviewsRouter } from "./routes/interview/route";
import { resumeRouter } from "./routes/resume/route";

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
  .use("/api/resume", authMiddleware)
  .use("/api/resume/*", authMiddleware)
  .use("/api/chat", authMiddleware)
  .use("/api/chat/*", authMiddleware)
  .use("/api/interview/parse-resume", authMiddleware)
  .use("/api/studio/interviews", authMiddleware, adminMiddleware)
  .use("/api/studio/interviews/*", authMiddleware, adminMiddleware)
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
  .route("/agent", agentRouter)
  .route("/chat", chatRouter)
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/studio/interviews", studioInterviewsRouter);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
