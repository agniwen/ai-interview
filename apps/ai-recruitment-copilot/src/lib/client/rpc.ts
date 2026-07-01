import type { AppType } from "@arc/ai-recruitment-copilot-backend/server/app";
import { hc } from "hono/client";

// 中文：前端访问 Hono API 的统一 RPC 入口。AppType 由 src/server/app.ts 派生，
// 路径形如 rpc.api.studio.interviews.$get(...)，第一段 `api` 对应 server 端
// .route("/api", apiRoutes) 挂载点；URL 与调用形状一一对应。
// 文件上传 (FormData/File) 与流式 (SSE / 二进制流) 端点 hc 不支持，
// 请继续走 src/lib/api/client.ts 的 apiFetch 直连 fetch。
//
// English: Unified Hono RPC entry for frontend → /api/* JSON endpoints.
// AppType is derived from src/server/app.ts; the call shape mirrors the URL,
// e.g. rpc.api.studio.interviews.$get(...). The leading `api` segment is the
// server-side mount in app.ts (.route("/api", apiRoutes)).
//
// File uploads (FormData / File) and streaming responses (SSE / binary
// streams) are NOT supported by hc — keep using apiFetch in
// src/lib/api/client.ts for those.
export const rpc = hc<AppType>("", {
  // 中文：携带 Cookie，让同源挂载和独立 Hono 域名部署都能保留 better-auth session。
  // English: include cookies for both same-origin mounts and cross-origin Hono deployments.
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: "include",
    })) as typeof fetch,
});

export type Rpc = typeof rpc;
