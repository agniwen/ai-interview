/**
 * 聊天会话相关的 API 调用集合。
 * Chat-conversation API call collection.
 *
 * 全部经由 {@link apiFetch} 走统一错误 / 编解码逻辑；类型在 `@/types/chat` 中聚合。
 * All calls go through {@link apiFetch} for uniform error / decoding behavior; types are
 * aggregated in `@/types/chat`.
 */

import type { UIMessage } from "ai";
import type { JobDescriptionConfig } from "@/lib/job-description-config";
import { apiFetch } from "../client";

/**
 * 会话摘要：用于侧边栏 / 列表展示。
 * Conversation summary used for sidebar / list rendering.
 */
export interface ChatConversationSummary {
  id: string;
  title: string;
  isTitleGenerating: boolean;
  updatedAt: number;
  createdAt: number;
}

/**
 * 完整会话：包含上下文配置与历史消息。
 * Full conversation including config and message history.
 */
export interface ChatConversationDetail extends ChatConversationSummary {
  jobDescription: string;
  jobDescriptionConfig: JobDescriptionConfig | null;
  resumeImports: Record<string, string>;
  messages: UIMessage[];
  activeWorkflowRunId: string | null;
}

/**
 * 创建 / 更新会话的请求体。
 * Request payload for creating or updating a conversation.
 */
export interface UpsertConversationPayload {
  id: string;
  title?: string;
  isTitleGenerating?: boolean;
  jobDescription?: string;
  jobDescriptionConfig?: JobDescriptionConfig | null;
  resumeImports?: Record<string, string>;
  createdAt?: number;
}

/**
 * 局部更新会话的字段集合。
 * Patch payload for updating selected fields of a conversation.
 */
export interface PatchConversationPayload {
  title?: string;
  isTitleGenerating?: boolean;
  jobDescription?: string;
  jobDescriptionConfig?: JobDescriptionConfig | null;
  resumeImports?: Record<string, string>;
}

/**
 * 上传附件后的返回结构。
 * Upload-attachment response.
 */
export interface UploadedAttachment {
  id: string;
  url: string;
}

/**
 * 拉取所有会话摘要。
 * Fetch the full list of conversation summaries.
 */
export async function fetchConversations(): Promise<ChatConversationSummary[]> {
  const data = await apiFetch<{ conversations: ChatConversationSummary[] }>(
    "/api/chat/conversations",
  );
  return data.conversations;
}

/**
 * 拉取单个会话；不存在时返回 null（404 静默）。
 * Fetch a single conversation; returns null when not found (404 swallowed).
 */
export async function fetchConversation(id: string): Promise<ChatConversationDetail | null> {
  const data = await apiFetch<{ conversation: ChatConversationDetail } | null>(
    `/api/chat/conversations/${encodeURIComponent(id)}`,
    { allow404: true },
  );
  return data?.conversation ?? null;
}

/**
 * 创建或更新会话。
 * Create or update a conversation.
 */
export async function upsertConversation(payload: UpsertConversationPayload): Promise<void> {
  await apiFetch("/api/chat/conversations", { body: payload, method: "POST" });
}

/**
 * 局部更新会话字段。
 * Patch selected fields of a conversation.
 */
export async function patchConversation(
  id: string,
  payload: PatchConversationPayload,
): Promise<void> {
  await apiFetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    body: payload,
    method: "PATCH",
  });
}

/**
 * 删除会话；服务端返回 404 时也视为成功（幂等）。
 * Delete a conversation; 404 from the server is treated as success (idempotent).
 */
export async function deleteConversation(id: string): Promise<void> {
  await apiFetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    allow404: true,
    method: "DELETE",
  });
}

/**
 * 把一条 UI 消息回写到服务端。
 * Persist a UI message to the server.
 */
export async function upsertChatMessageOnServer(
  conversationId: string,
  message: UIMessage,
): Promise<void> {
  await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    body: { message },
    method: "POST",
  });
}

/**
 * 上传附件（PDF / 图片等）；自动包装成 multipart/form-data。
 * Upload an attachment (PDF / image / ...); transparently wrapped as multipart/form-data.
 */
export function uploadAttachment(blob: Blob, filename: string): Promise<UploadedAttachment> {
  const form = new FormData();
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type || "application/pdf" });
  form.append("file", file, filename);

  return apiFetch<UploadedAttachment>("/api/chat/uploads", {
    body: form,
    method: "POST",
  });
}
