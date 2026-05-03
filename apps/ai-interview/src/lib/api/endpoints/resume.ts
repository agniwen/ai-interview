/**
 * 简历筛选（resume screening）相关 API。
 * Resume-screening API.
 *
 * 这一组方法对应 `/api/resume/*` 路由族。当前对外暴露：
 *   - `requestResumeChatTitle`：根据用户首条消息生成会话标题。
 *
 * 注：`/api/resume`（POST）是 AI SDK 的流式聊天端点，调用方应通过 `useChat` 使用
 * `DefaultChatTransport` 直接对接，而不是本模块——因此这里不暴露同步包装。
 *
 * Maps to the `/api/resume/*` route family. Currently exposes:
 *   - `requestResumeChatTitle` — generate a conversation title from the first message.
 *
 * Note: `/api/resume` (POST) is an AI SDK streaming chat endpoint. Callers should use
 * the `useChat` + `DefaultChatTransport` integration directly rather than going
 * through this module, so we deliberately don't wrap it.
 */

import { apiFetch } from "../client";

/**
 * 简历筛选会话的智能标题生成请求体。
 * Payload for the resume-chat title generation.
 */
export interface ResumeChatTitleRequest {
  text: string;
  hasFiles: boolean;
}

/**
 * 智能标题生成请求；失败时调用方应回退到默认标题。
 * Generate a smart title; callers should fall back to a default on failure.
 */
export function requestResumeChatTitle(
  payload: ResumeChatTitleRequest,
): Promise<{ title?: string }> {
  return apiFetch<{ title?: string }>("/api/resume/title", {
    body: payload,
    method: "POST",
  });
}
