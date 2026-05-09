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
 * 中文：纯 JSON 端点请优先用 `@/lib/rpc` 的 hc 客户端；apiFetch 仅保留给
 * FormData / 流式 / 二进制等 RPC 不支持的调用，以及 `endpoints/chat.ts` 等
 * 暂未迁移的旧 wrapper。candidate-side `endpoints/interview.ts` 已经全部
 * 走 rpc，文件被删除。
 *
 * English: prefer the hc client from `@/lib/rpc` for JSON endpoints. apiFetch
 * stays for FormData / streaming / binary endpoints (unsupported by RPC) and
 * for not-yet-migrated wrappers in `endpoints/chat.ts`. The candidate
 * `endpoints/interview.ts` was fully RPC-migrated and deleted.
 */

export { ApiError, isApiError } from "./errors";
export { apiFetch, type ApiFetchOptions } from "./client";
export * from "./endpoints/chat";
export * from "./endpoints/studio-interviews";
export * from "./endpoints/resume";
