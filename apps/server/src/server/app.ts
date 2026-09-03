import type { Env } from "./type";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth, trustedOrigins } from "../lib/server/auth";
import { runWithAuthRequestHeaders } from "../lib/server/auth-request-context";
import { handleServerError } from "./error-handler";
import { factory } from "./factory";
import { betterAuthMiddleware } from "./middlewares/better-auth";
import { agentRouter } from "./routes/agent/route-runtime";
import { interviewRouter } from "./routes/interview/route";
import { joinRouter } from "./routes/join/route";
import { livekitRouter } from "./routes/livekit/route";
import { meetingLocalRecoveryRouter } from "./routes/meeting-local-recovery/route";
import { platformRouter } from "./routes/platform/route";
import { publicRouter } from "./routes/public/route";
import { humanInterviewReviewRouter } from "./routes/public/routes/human-interview-review/route";
import { resumeRouter } from "./routes/resume/route";
import { sessionRouter } from "./routes/session/route-runtime";
import { workspaceRouter } from "./routes/workspace/route";
import { attachBusinessRoutes } from "./routing";

// 中文：所有业务路由都聚合到 apiRoutes，再以 .route("/api", apiRoutes) 挂上去。
// 不要写 .basePath("/api") —— 那样 hc<AppType> 推断出的客户端类型不会带 /api 前缀，
// 调用形如 rpc.studio.x.$get() 而不是 rpc.api.studio.x.$get()，与 URL 不一致。
// English: All business routes live inside apiRoutes and are mounted via
// .route("/api", apiRoutes). Do NOT use .basePath("/api") — the resulting
// hc<AppType> client loses the /api prefix in its inferred type, breaking
// the URL ↔ call shape correspondence.
const apiRoutes = factory
  .createApp()
  .route("/agent", agentRouter)
  .route("/livekit", livekitRouter)
  .route("/meeting-local-recovery", meetingLocalRecoveryRouter)
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/platform", platformRouter)
  .route("/public", publicRouter)
  .route("/join", joinRouter)
  .route("/session", sessionRouter)
  .route("/w/:slug", workspaceRouter);

const trustedOriginSet = new Set(trustedOrigins);

/**
 * CORS for credentialed browser clients (web + Electron desktop at localhost).
 * Allow-list matches better-auth `trustedOrigins` so desktop can call studio
 * RPCs cross-origin with cookies after Feishu login.
 */
const apiCors = cors({
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  origin: (origin) => (origin && trustedOriginSet.has(origin) ? origin : null),
});

// 中文：app.ts 只做 CORS、better-auth handler、betterAuth 上下文注入、apiRoutes 挂载。
// 业务中间件（auth/admin）请在各自 route 内部声明，不要在这里 .use(...)。
// English: app.ts is mount-only — CORS, the better-auth handler, the
// betterAuth context middleware, and the /api mount. Business middleware
// (auth/admin) belongs inside each router.
export function createServerApp() {
  const honoApp = new Hono<Env>()
    .use(logger())
    // Desktop + any cross-origin trusted client: CORS on all /api routes
    // (auth was previously the only path; studio resumes need the same headers).
    .use("/api/*", apiCors)
    .on(["POST", "GET"], "/api/auth/*", (c) =>
      runWithAuthRequestHeaders(c.req.raw.headers, () => auth.handler(c.req.raw)),
    )
    .use(betterAuthMiddleware);

  // The review board uses plain fetch rather than hc. Its router type is erased,
  // keeping it out of the global RPC schema while preserving sibling public routes.
  const routedApp = attachBusinessRoutes(honoApp, apiRoutes, humanInterviewReviewRouter);

  routedApp.notFound((c) => c.json({ error: "Not Found" }, 404));
  routedApp.onError(handleServerError);
  return routedApp;
}

export type AppType = ReturnType<typeof createServerApp>;
