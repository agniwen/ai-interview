import type { Env } from "@/server/type";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "@/lib/server/auth";
import { factory } from "./factory";
import { betterAuthMiddleware } from "./middlewares/better-auth";
import { agentRouter } from "./routes/agent/route";
import { chatRouter } from "./routes/chat/route";
import { feishuRouter } from "./routes/feishu/route";
import { interviewRouter } from "./routes/interview/route";
import { livekitRouter } from "./routes/livekit/route";
import { resumeRouter } from "./routes/resume/route";
import { skillRouter } from "./routes/skill/route";
import { studioRouter } from "./routes/studio/route";

// 中文：所有业务路由都聚合到 apiRoutes，再以 .route("/api", apiRoutes) 挂上去。
// 不要写 .basePath("/api") —— 那样 hc<AppType> 推断出的客户端类型不会带 /api 前缀，
// 调用形如 rpc.studio.x.$get() 而不是 rpc.api.studio.x.$get()，与 URL 不一致。
// English: All business routes live inside apiRoutes and are mounted via
// .route("/api", apiRoutes). Do NOT use .basePath("/api") — the resulting
// hc<AppType> client loses the /api prefix in its inferred type, breaking
// the URL ↔ call shape correspondence.
const apiRoutes = factory
  .createApp()
  .route("/", feishuRouter)
  .route("/agent", agentRouter)
  .route("/livekit", livekitRouter)
  .route("/chat", chatRouter)
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/skill", skillRouter)
  .route("/studio", studioRouter);

// 中文：app.ts 只做 CORS、better-auth handler、betterAuth 上下文注入、apiRoutes 挂载。
// 业务中间件（auth/admin）请在各自 route 内部声明，不要在这里 .use(...)。
// English: app.ts is mount-only — CORS, the better-auth handler, the
// betterAuth context middleware, and the /api mount. Business middleware
// (auth/admin) belongs inside each router.
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
  .route("/api", apiRoutes);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
