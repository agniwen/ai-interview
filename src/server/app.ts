import type { Env } from "@/server/type";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/auth";
import { getFeishuBot } from "./feishu/bot";
import { adminMiddleware } from "./middlewares/admin";
import { authMiddleware } from "./middlewares/auth";
import { betterAuthMiddleware } from "./middlewares/better-auth";
import { agentRouter } from "./routes/agent/route";
import { candidateFormsRouter } from "./routes/candidate-forms/route";
import { chatRouter } from "./routes/chat/route";
import { departmentsRouter } from "./routes/department/route";
import { globalConfigRouter } from "./routes/global-config/route";
import { interviewRouter, studioInterviewsRouter } from "./routes/interview/route";
import { interviewersRouter } from "./routes/interviewer/route";
import { interviewQuestionTemplatesRouter } from "./routes/interview-question-templates/route";
import { jobDescriptionsRouter } from "./routes/job-description/route";
import { livekitRouter } from "./routes/livekit/route";
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
  .use("/api/studio/departments", authMiddleware, adminMiddleware)
  .use("/api/studio/departments/*", authMiddleware, adminMiddleware)
  .use("/api/studio/global-config", authMiddleware, adminMiddleware)
  .use("/api/studio/global-config/*", authMiddleware, adminMiddleware)
  .use("/api/studio/interviewers", authMiddleware, adminMiddleware)
  .use("/api/studio/interviewers/*", authMiddleware, adminMiddleware)
  .use("/api/studio/job-descriptions", authMiddleware, adminMiddleware)
  .use("/api/studio/job-descriptions/*", authMiddleware, adminMiddleware)
  .use("/api/studio/forms", authMiddleware, adminMiddleware)
  .use("/api/studio/forms/*", authMiddleware, adminMiddleware)
  .use("/api/studio/interview-questions", authMiddleware, adminMiddleware)
  .use("/api/studio/interview-questions/*", authMiddleware, adminMiddleware)
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
  .route("/studio/interviews", studioInterviewsRouter)
  .route("/studio/departments", departmentsRouter)
  .route("/studio/global-config", globalConfigRouter)
  .route("/studio/interviewers", interviewersRouter)
  .route("/studio/job-descriptions", jobDescriptionsRouter)
  .route("/studio/forms", candidateFormsRouter)
  .route("/studio/interview-questions", interviewQuestionTemplatesRouter);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
