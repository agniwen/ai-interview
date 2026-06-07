import "client-only";

import type { AppType } from "@arc/backend/server/app";
import { hc } from "hono/client";

// 中文：前端访问 Hono API 的统一 RPC 入口。AppType 由 src/server/app.ts 派生，
// 路径形如 rpc.api.studio.interviews.$get(...)，第一段 `api` 对应 server 端
// .route("/api", apiRoutes) 挂载点；URL 与调用形状一一对应。
// 文件上传 (FormData/File) 与流式 (NDJSON / SSE / 二进制流) 端点 hc 不支持，
// 请继续走 src/lib/api/client.ts 的 apiFetch 直连 fetch。
//
// English: Unified Hono RPC entry for frontend → /api/* JSON endpoints.
// AppType is derived from src/server/app.ts; the call shape mirrors the URL,
// e.g. rpc.api.studio.interviews.$get(...). The leading `api` segment is the
// server-side mount in app.ts (.route("/api", apiRoutes)).
//
// File uploads (FormData / File) and streaming responses (NDJSON / SSE /
// binary streams) are NOT supported by hc — keep using apiFetch in
// src/lib/api/client.ts for those.
export const rpc = hc<AppType>("", {
  // 中文：携带同源 Cookie，让 better-auth 的 session 能自动带上。
  // English: forward same-origin cookies so better-auth sessions ride along.
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      credentials: "same-origin",
    })) as typeof fetch,
});

export type Rpc = typeof rpc;
