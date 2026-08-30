import {
  hcChatWithType,
  hcPublicWithType,
  hcStudioInterviewsWithType,
  hcWithType,
} from "@app/server/rpc-client";

// 中文：前端访问 Hono API 的统一 RPC 入口。AppType 由 src/server/app.ts 派生，
// 路径形如 rpc.api.studio.interviews.$get(...)，第一段 `api` 对应 server 端
// .route("/api", apiRoutes) 挂载点；URL 与调用形状一一对应。
// 项目约定文件上传 (FormData/File)、流式 (SSE) 与二进制响应继续走
// src/lib/client/api 的 apiFetch/plain fetch；hc 本身支持表单上传，但这里保留
// JSON RPC 与特殊传输端点之间的清晰边界。
//
// English: Unified Hono RPC entry for frontend → /api/* JSON endpoints.
// AppType is derived from src/server/app.ts; the call shape mirrors the URL,
// e.g. rpc.api.studio.interviews.$get(...). The leading `api` segment is the
// server-side mount in app.ts (.route("/api", apiRoutes)).
//
// By project convention, file uploads (FormData / File), streaming responses,
// and binary responses keep using apiFetch/plain fetch from src/lib/client/api.
// hc supports form uploads, but this boundary keeps JSON RPC separate from
// special transports.
export const rpcClientOptions = {
  // 中文：携带 Cookie，让同源挂载和独立 Hono 域名部署都能保留 better-auth session。
  // English: include cookies for both same-origin mounts and cross-origin Hono deployments.
  init: { credentials: "include" },
} as const;

export const rpc = hcWithType("", rpcClientOptions);
export const publicRpc = hcPublicWithType("/api/public", rpcClientOptions);

export function chatRpc(slug: string) {
  return hcChatWithType(`/api/w/${encodeURIComponent(slug)}/chat`, rpcClientOptions);
}

export function studioInterviewsRpc(slug: string) {
  return hcStudioInterviewsWithType(
    `/api/w/${encodeURIComponent(slug)}/studio/interviews`,
    rpcClientOptions,
  );
}

export type Rpc = typeof rpc;
