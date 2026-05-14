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
import { platformRouter } from "./routes/platform/route";
import { resumeRouter } from "./routes/resume/route";
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
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/platform", platformRouter)
  .route("/w/:slug/studio", studioRouter)
  .route("/w/:slug/chat", chatRouter);

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
  // better-auth handler 外包一层请求日志：OAuth 回调链路是 sign-in → Google → callback
  // → set-session，任何一跳挂了都会以 4xx/5xx 落地，没日志就只能在浏览器看到一个红框。
  // 这里记下方法、路径、状态、耗时、origin/referer，配合 [better-auth:*] 内部日志能精准
  // 定位是哪一步出问题（特别是 redirect_uri_mismatch 触发的 callback 失败）。
  // Request-level logging around the better-auth handler. The Google login
  // path is sign-in → Google → /callback → set-session; any hop can 4xx/5xx
  // silently. These logs plus [better-auth:*] internal logs pinpoint the
  // failing step (typical case: redirect_uri_mismatch on the /callback hop).
  .on(["POST", "GET"], "/api/auth/*", async (ctx) => {
    const start = Date.now();
    const url = new URL(ctx.req.url);
    const path = url.pathname + url.search;
    const meta = {
      method: ctx.req.method,
      origin: ctx.req.header("origin") ?? null,
      path,
      referer: ctx.req.header("referer") ?? null,
    };
    console.log("[auth:req:start]", meta);
    try {
      const response = await auth.handler(ctx.req.raw);
      // 把所有 Set-Cookie 头收集起来打日志——OAuth state / PKCE cookie 的
      // SameSite / Secure / Domain 属性若错一个，整条链路就会在浏览器侧悄悄断掉，
      // 这里是唯一能在服务端直接看到 cookie 输出状态的地方。
      // Collect every Set-Cookie header so we can verify the OAuth state /
      // PKCE cookies' SameSite / Secure / Domain attributes — a single wrong
      // attribute silently breaks the OAuth bounce on the browser side, and
      // this is the only place we can inspect them server-side.
      const setCookies: string[] = [];
      for (const [key, value] of response.headers) {
        if (key.toLowerCase() === "set-cookie") {
          setCookies.push(value);
        }
      }
      console.log("[auth:req:end]", {
        ...meta,
        durationMs: Date.now() - start,
        // 302 是 OAuth 链路里最常见的状态——location 头能直接告诉你下一跳要去哪
        // (Google authorize URL / app 内 callbackURL / 错误页)，是排查 mismatch 的关键线索。
        // 302 dominates the OAuth path; the Location header reveals the next
        // hop (Google authorize URL, app callbackURL, or error page) — critical
        // when chasing a misconfigured redirect.
        location: response.headers.get("location"),
        setCookieCount: setCookies.length,
        setCookies: setCookies.map((c) => c.split(";")[0]?.split("=")[0] ?? ""),
        status: response.status,
      });
      return response;
    } catch (error) {
      console.error("[auth:req:error]", {
        ...meta,
        durationMs: Date.now() - start,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      });
      throw error;
    }
  })
  .use(betterAuthMiddleware)
  .route("/api", apiRoutes);

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export type AppType = typeof app;
