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
import type { JobDescriptionConfig } from "@app/db-schema/job-description-config";
import type { JsonValue } from "@app/db-schema/json";
import type { CandidateOutcome, ClosedMeta, PipelineStage } from "@app/db-schema/studio-interviews";
import { chatRpc, rpc } from "@/lib/client/rpc";
import { rpcFetch, rpcFetchAs } from "../rpc-fetch";

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

type StoredChatConversationDetail = Omit<ChatConversationDetail, "messages"> & {
  messages: JsonValue[];
};

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
 * 拉取所有会话摘要。
 * Fetch the full list of conversation summaries.
 */
export async function fetchConversations(slug: string): Promise<ChatConversationSummary[]> {
  const data = await rpcFetch(chatRpc(slug).conversations.$get(), "加载会话列表失败");
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
  const data = await rpcFetchAs<{ conversation: StoredChatConversationDetail }>(
    chatRpc(slug).conversations[":id"].$get({ param: { id } }),
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
