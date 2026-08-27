/**
 * 聊天会话相关的 API 调用集合。
 * Chat-conversation API call collection.
 *
 * JSON 端点全部走 Hono RPC（{@link rpc}）+ {@link rpcFetch}；上传 (`uploadAttachment`)
 * 按项目约定继续使用 `apiFetch` + multipart。
 *
 * JSON endpoints use Hono RPC (`rpc`) + `rpcFetch`. The multipart upload path
 * (`uploadAttachment`) stays on `apiFetch` by project convention.
 */

import { validateUIMessages } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import type { JobDescriptionConfig } from "@arc/db-schema/job-description-config";
import type { JsonValue } from "@arc/db-schema/json";
import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@arc/db-schema/studio-interviews";
import { rpc } from "@/lib/client/rpc";
import { sha256HexOfFile } from "@arc/shared/file-hash";
import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";
import { apiFetch } from "../client";
import { rpcFetch } from "../rpc-fetch";

const storedChatMessageSchema = z
  .object({ role: z.enum(["assistant", "system", "tool", "user"]) })
  .catchall(z.json());

function normalizeStoredChatMessage(message: JsonValue): JsonValue {
  const parsed = storedChatMessageSchema.safeParse(message);
  if (!(parsed.success && parsed.data.role === "tool")) {
    return message;
  }
  return { ...parsed.data, role: "assistant" };
}

/**
 * 会话摘要：用于侧边栏 / 列表展示。
 * Conversation summary used for sidebar / list rendering.
 */
export interface ChatConversationSummary {
  id: string;
  title: string;
  isTitleGenerating: boolean;
  updatedAt: string;
  createdAt: string;
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

interface RecruitingActionProposalBase {
  explanation: string;
  id: string;
  title: string;
}

export type RecruitingActionProposal = RecruitingActionProposalBase &
  (
    | {
        payload: { jobDescriptionId?: string | null; resumeRecordId: string };
        type: "bind_candidate_to_job";
      }
    | {
        payload: { jobDescriptionId?: string | null; poolItemId: string };
        type: "bind_pool_item_to_job";
      }
    | {
        payload: {
          closedMeta?: Omit<ClosedMeta, "previousStage">;
          closedReason?: string | null;
          outcome?: CandidateOutcome;
          pipelineStage: PipelineStage;
          reactivationReason?: string;
          resumeRecordId: string;
        };
        type: "advance_candidate_stage";
      }
    | {
        payload: {
          interviewQuestions?: {
            difficulty: "easy" | "hard" | "medium";
            evaluationFocus?: string | null;
            followUpDirections?: string | null;
            order: number;
            question: string;
          }[];
          resumeRecordId: string;
        };
        type: "generate_interview_questions";
      }
  );

export interface RecruitingActionConfirmation {
  confirmedAt: string;
  jobDescriptionId?: string;
  jobDescriptionName?: string | null;
  status: "confirmed" | "ignored";
}

export interface RecruitingActionProposalResult {
  confirmation?: RecruitingActionConfirmation;
  proposal?: RecruitingActionProposal;
}

export interface ConfirmRecruitingActionResult {
  actionType?: RecruitingActionProposal["type"];
  confirmation?: RecruitingActionConfirmation;
  message: string;
  status: "executed" | "failed" | "noop";
}

/**
 * 上传附件后的返回结构。
 * Upload-attachment response. When the file is a resume PDF, the server runs
 * Qwen-VL OCR + structured extraction inline and returns the result so the
 * client can attach it to the outgoing message as a data part — no need for
 * a second roundtrip and no server-side DB lookup at send time.
 */
export interface UploadedAttachment {
  id: string;
  url: string;
  parseStatus?: "ready" | "failed" | "pending";
  parsed?: {
    text: string;
    structured: unknown;
    pageCount: number;
    textSource: AttachmentTextSource;
  };
}

/**
 * 拉取所有会话摘要。
 * Fetch the full list of conversation summaries.
 */
export async function fetchConversations(slug: string): Promise<ChatConversationSummary[]> {
  const data = await rpcFetch(
    rpc.api.w[":slug"].chat.conversations.$get({ param: { slug } }),
    "加载会话列表失败",
  );
  return data.conversations;
}

/**
 * 拉取单个会话；不存在时返回 null（404 静默）。
 * Fetch a single conversation; returns null when not found (404 swallowed).
 */
export async function fetchConversation(
  slug: string,
  id: string,
): Promise<ChatConversationDetail | null> {
  const data = await rpcFetch(
    rpc.api.w[":slug"].chat.conversations[":id"].$get({ param: { id, slug } }),
    "加载会话失败",
    { allow404: true },
  );
  const conversation = data?.conversation;
  if (!conversation) {
    return null;
  }
  const messages = await validateUIMessages<UIMessage>({
    messages: conversation.messages.map(normalizeStoredChatMessage),
  });
  return { ...conversation, messages };
}

/**
 * 创建或更新会话。
 * Create or update a conversation.
 */
export async function upsertConversation(
  slug: string,
  payload: UpsertConversationPayload,
): Promise<void> {
  await rpcFetch(
    rpc.api.w[":slug"].chat.conversations.$post({ json: payload, param: { slug } }),
    "保存会话失败",
  );
}

/**
 * 局部更新会话字段。
 * Patch selected fields of a conversation.
 */
export async function patchConversation(
  slug: string,
  id: string,
  payload: PatchConversationPayload,
): Promise<void> {
  await rpcFetch(
    rpc.api.w[":slug"].chat.conversations[":id"].$patch({
      json: payload,
      param: { id, slug },
    }),
    "更新会话失败",
  );
}

/**
 * 删除会话；服务端返回 404 时也视为成功（幂等）。
 * Delete a conversation; 404 from the server is treated as success (idempotent).
 */
export async function deleteConversation(slug: string, id: string): Promise<void> {
  await rpcFetch(
    rpc.api.w[":slug"].chat.conversations[":id"].$delete({ param: { id, slug } }),
    "删除会话失败",
    { allow404: true },
  );
}

/**
 * 把一条 UI 消息回写到服务端。
 * Persist a UI message to the server.
 */
export async function upsertChatMessageOnServer(
  slug: string,
  conversationId: string,
  message: UIMessage,
): Promise<void> {
  const wireMessage = z
    .object({ id: z.string(), role: z.enum(["system", "user", "assistant"]) })
    .catchall(z.json())
    .parse(message);
  await rpcFetch(
    rpc.api.w[":slug"].chat.conversations[":id"].messages.$post({
      json: { message: wireMessage },
      param: { id: conversationId, slug },
    }),
    "保存消息失败",
  );
}

export async function confirmRecruitingAction(
  slug: string,
  conversationId: string,
  proposal: RecruitingActionProposal,
  options?: { decision?: "confirm" | "ignore" },
): Promise<ConfirmRecruitingActionResult> {
  return await rpcFetch(
    rpc.api.w[":slug"].chat.conversations[":id"].actions.confirm.$post({
      json: {
        decision: options?.decision ?? "confirm",
        proposal,
      },
      param: { id: conversationId, slug },
    }),
    "确认动作失败",
  );
}

/**
 * 仅对支持的简历文件尝试预检请求：命中缓存则直接返回已有附件，避免重复上传。
 * Try a preflight request for supported resume documents: return the cached
 * attachment on a hit, skipping the redundant upload entirely.
 *
 * 任何失败（哈希计算、网络、服务端错误）都安静降级到 multipart 路径——保持上传可用性。
 * Any failure (hash computation, network, server error) silently degrades to the
 * multipart path to keep uploads available.
 */
async function tryUploadPreflight(slug: string, file: File): Promise<UploadedAttachment | null> {
  if (!isSupportedResumeDocumentInput({ fileName: file.name, mediaType: file.type })) {
    return null;
  }
  let hash: string;
  try {
    hash = await sha256HexOfFile(file);
  } catch {
    return null;
  }
  try {
    const result = await rpcFetch(
      rpc.api.w[":slug"].chat.uploads.preflight.$post({
        json: {
          filename: file.name || "attachment.pdf",
          hash,
          mediaType: file.type,
          size: file.size,
        },
        param: { slug },
      }),
      "检查附件缓存失败",
    );
    if (!result.hit) {
      return null;
    }
    const { hit: _hit, ...rest } = result;
    return rest;
  } catch {
    // preflight 任何失败都安静降级到 multipart 路径——保持上传可用性。
    // Any preflight failure silently degrades to the multipart path.
    return null;
  }
}

/**
 * 上传附件；支持的简历文件先走预检去重，缓存命中则跳过字节传输；否则降级为 multipart/form-data。
 * Upload an attachment; supported resume documents attempt a preflight dedup
 * first — a cache hit skips byte transfer entirely; otherwise falls back to multipart/form-data.
 */
export async function uploadAttachment(
  slug: string,
  blob: Blob,
  filename: string,
): Promise<UploadedAttachment> {
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type || "application/octet-stream" });

  const hit = await tryUploadPreflight(slug, file);
  if (hit) {
    return hit;
  }

  const form = new FormData();
  form.append("file", file, filename);

  return apiFetch<UploadedAttachment>(`/api/w/${slug}/chat/uploads`, {
    body: form,
    method: "POST",
  });
}
