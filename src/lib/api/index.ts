// oxlint-disable no-barrel-file -- 这是 API 层的统一入口；barrel 文件是有意为之。
//                                    Intentional barrel: single entry point for the API layer.
/**
 * 前端 API 层统一入口。
 * Single entry point for the frontend API layer.
 *
 * 业务代码示例：
 *   import { apiFetch, ApiError, fetchConversations } from "@/lib/api";
 */

export { ApiError, isApiError } from "./errors";
export { apiFetch, type ApiFetchOptions } from "./client";
export * from "./endpoints/chat";
