import { generateResumeConversationTitle, listResumeChatModels } from "@/lib/client/backend-api";
import { apiRequest } from "../rpc-fetch";

/**
 * 简历筛选（resume screening）相关 API。
 * Resume-screening API.
 *
 * 这一组方法对应 system 平台配置与 workspace copilot 路由族。当前对外暴露：
 *   - `requestResumeChatTitle`：根据用户首条消息生成会话标题。
 *
 * 注：`/workspaces/:workspaceSlug/copilot/resume-chat`（POST）是 AI SDK 的流式聊天端点，调用方应通过 `useChat` 使用
 * `DefaultChatTransport` 直接对接，而不是本模块——因此这里不暴露同步包装。
 *
 * Maps to the Nest system/copilot route families. Currently exposes:
 *   - `requestResumeChatTitle` — generate a conversation title from the first message.
 *
 * Note: `/workspaces/:workspaceSlug/copilot/resume-chat` is an AI SDK streaming endpoint. Callers should use
 * the `useChat` + `DefaultChatTransport` integration directly rather than going
 * through this module, so we deliberately don't wrap it.
 */

/**
 * 简历筛选会话的智能标题生成请求体。
 * Payload for the resume-chat title generation.
 */
export interface ResumeChatTitleRequest {
  text: string;
  hasFiles: boolean;
}

/**
 * 单个可选模型的元数据。数据源由服务端的 `chat-models.config` 维护。
 * Single model option. Source of truth is the server-side `chat-models.config`.
 */
export interface ChatModelOption {
  id: string;
  label: string;
  provider: "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";
}

export interface ChatModelsResponse {
  defaultId: string;
  models: readonly ChatModelOption[];
}

/**
 * 拉取允许在 composer 中选择的模型列表。
 * Fetch the list of models exposed in the chat composer picker.
 */
export function fetchChatModels(): Promise<ChatModelsResponse> {
  return apiRequest(listResumeChatModels({}), "加载模型列表失败");
}

/**
 * 智能标题生成请求；失败时调用方应回退到默认标题。
 * Generate a smart title; callers should fall back to a default on failure.
 */
export function requestResumeChatTitle(
  payload: ResumeChatTitleRequest,
): Promise<{ title?: string }> {
  return apiRequest(generateResumeConversationTitle({ body: payload }), "生成标题失败");
}
