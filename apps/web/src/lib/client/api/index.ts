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
 * 中文：纯 JSON 端点全部走 Hey API 生成 SDK + `apiRequest`；
 * apiFetch 仅保留给 FormData / 流式 / 二进制等生成客户端不适用的调用
 * （聊天附件目前只剩 `uploadAttachment` 的 multipart 上传）。
 *
 * English: all JSON endpoints go through the generated Hey API SDK +
 * `apiRequest`. apiFetch stays for FormData / streaming / binary endpoints
 * unsupported by RPC (chat attachments are now down to `uploadAttachment` multipart).
 */

export { ApiError, isApiError } from "./errors";
export { apiFetch, type ApiFetchOptions } from "./client";
export { apiRequest, apiResponse } from "./rpc-fetch";
export { extractResumeDedupConflictMatches } from "./resume-dedup-conflict";
export * from "./endpoints/chat";
export * from "./endpoints/public-interview";
export * from "./endpoints/studio-interviews";
export * from "./endpoints/studio-calendar";
export * from "./endpoints/resume";
export * from "./endpoints/studio-resumes";
export * from "./endpoints/resume-pool";
export * from "./endpoints/referrals";
export * from "./endpoints/human-interview-candidate-materials";
