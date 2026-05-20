import "client-only";

// oxlint-disable no-barrel-file -- 这是 API 层的统一入口；barrel 文件是有意为之。
//                                    Intentional barrel: single entry point for the API layer.
/**
 * 前端 API 层统一入口。
 * Single entry point for the frontend API layer.
 *
 * 业务代码示例 / Examples:
 *   import {
 *     apiFetch, ApiError,
 *     fetchConversations,
 *     fetchStudioInterviews,
 *     requestResumeChatTitle,
 *   } from "@/lib/client/api";
 *
 * 中文：纯 JSON 端点全部走 `@/lib/client/rpc` 的 hc 客户端 + `rpcFetch`；
 * apiFetch 仅保留给 FormData / 流式 / 二进制等 RPC 不支持的调用
 * （目前只剩 `uploadAttachment` 的 multipart 上传 + 它的 preflight）。
 *
 * English: all JSON endpoints go through `@/lib/client/rpc`'s hc client +
 * `rpcFetch`. apiFetch stays for FormData / streaming / binary endpoints
 * unsupported by RPC (now down to `uploadAttachment` multipart + preflight).
 */

export { ApiError, isApiError } from "./errors";
export { apiFetch, type ApiFetchOptions } from "./client";
export { rpcFetch } from "./rpc-fetch";
export * from "./endpoints/chat";
export * from "./endpoints/public-interview";
export * from "./endpoints/studio-interviews";
export * from "./endpoints/resume";
export * from "./endpoints/studio-resumes";
