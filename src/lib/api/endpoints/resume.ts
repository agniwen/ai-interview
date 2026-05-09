/**
 * 简历筛选（resume screening）相关 API。
 * Resume-screening API.
 *
 * 这一组方法对应 `/api/resume/*` 路由族。当前对外暴露：
 *   - `requestResumeChatTitle`：根据用户首条消息生成会话标题。
 *
 * 注：`/api/resume/chat`（POST）是 AI SDK 的流式聊天端点，调用方应通过 `useChat` 使用
 * `DefaultChatTransport` 直接对接，而不是本模块——因此这里不暴露同步包装。
 *
 * Maps to the `/api/resume/*` route family. Currently exposes:
 *   - `requestResumeChatTitle` — generate a conversation title from the first message.
 *
 * Note: `/api/resume/chat` (POST) is an AI SDK streaming chat endpoint. Callers should use
 * the `useChat` + `DefaultChatTransport` integration directly rather than going
 * through this module, so we deliberately don't wrap it.
 */

import { rpc } from "@/lib/rpc";
import { ApiError } from "../errors";

/**
 * 简历筛选会话的智能标题生成请求体。
 * Payload for the resume-chat title generation.
 */
export interface ResumeChatTitleRequest {
  text: string;
  hasFiles: boolean;
}

/**
 * 单个可选模型的元数据（id 直接来自百炼 `/models`，分组/厂商由 id 推断）。
 * Single model option; id comes straight from DashScope `/models` and the
 * provider/group fields are inferred from the id pattern.
 */
export interface ChatModelOption {
  id: string;
  label: string;
  provider: "alibaba" | "deepseek" | "moonshot" | "zhipu" | "minimax" | "other";
  group: "fast" | "balanced" | "reasoning" | "long";
}

export interface ChatModelsResponse {
  defaultId: string;
  models: ChatModelOption[];
  /** 上游 `/models` 是否成功响应；为 false 时 models 列表会是空。
   *  Whether the upstream `/models` call succeeded; `models` is empty otherwise. */
  upstreamReachable: boolean;
}

/**
 * 拉取允许在 composer 中选择的模型列表。
 * Fetch the list of models exposed in the chat composer picker.
 */
export async function fetchChatModels(): Promise<ChatModelsResponse> {
  const res = await rpc.api.resume.models.$get();
  if (!res.ok) {
    throw new ApiError("加载模型列表失败", { status: res.status });
  }
  return (await res.json()) as ChatModelsResponse;
}

/**
 * 智能标题生成请求；失败时调用方应回退到默认标题。
 * Generate a smart title; callers should fall back to a default on failure.
 */
export async function requestResumeChatTitle(
  payload: ResumeChatTitleRequest,
): Promise<{ title?: string }> {
  const res = await rpc.api.resume.title.$post({ json: payload });
  if (!res.ok) {
    throw new ApiError("生成标题失败", { status: res.status });
  }
  return (await res.json()) as { title?: string };
}
