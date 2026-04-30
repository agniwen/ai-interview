/**
 * 兼容层：聊天 API 已迁至 `@/lib/api/endpoints/chat`。
 * Backward-compat shim: chat APIs now live under `@/lib/api/endpoints/chat`.
 *
 * 新代码请直接 `import { fetchConversations } from "@/lib/api"`，
 * 本文件仅为渐进迁移而保留，未来可在所有调用站点更新后删除。
 *
 * New code should `import { fetchConversations } from "@/lib/api"` directly.
 * This file only exists for incremental migration and can be removed once all
 * callers are updated.
 */

export type {
  ChatConversationDetail,
  ChatConversationSummary,
  PatchConversationPayload,
  UploadedAttachment,
  UpsertConversationPayload,
} from "@/lib/api/endpoints/chat";

export {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  patchConversation,
  upsertChatMessageOnServer,
  upsertConversation,
  uploadAttachment,
} from "@/lib/api/endpoints/chat";
