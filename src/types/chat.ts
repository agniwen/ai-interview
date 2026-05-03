/**
 * 聊天领域类型聚合点。
 * Aggregation barrel for chat-domain types.
 *
 * 当前真实定义仍在 `@/lib/chat-api`，未来若拆分到 `@/lib/api/endpoints/chat` 时
 * 仅需修改本文件即可，业务代码无感迁移。
 *
 * Source of truth currently lives in `@/lib/chat-api`. When the API layer migrates
 * to `@/lib/api/endpoints/chat`, only this file needs updating—callers stay stable.
 */

export type {
  ChatConversationDetail,
  ChatConversationSummary,
  PatchConversationPayload,
  UploadedAttachment,
  UpsertConversationPayload,
} from "@/lib/chat-api";
