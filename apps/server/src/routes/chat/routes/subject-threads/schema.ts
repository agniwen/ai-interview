import { z } from "zod";
import { chatSubjectKindSchema, subjectDraftIdSchema } from "@app/db-schema/chat-subject-threads";

export const subjectThreadParamSchema = z.object({
  kind: chatSubjectKindSchema,
  subjectId: z.string().trim().min(1).max(200),
});

export const subjectThreadConversationParamSchema = subjectThreadParamSchema.extend({
  conversationId: z.string().trim().min(1).max(200),
});

export const subjectThreadMessagesQuerySchema = z.object({
  before: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** 前端只提交本条用户消息与当前页面上下文；历史以服务端存储为准（ADR-0045）。 */
export const sendSubjectThreadMessageSchema = z.object({
  message: z
    .object({
      id: z.string().trim().min(1).max(200),
      parts: z.array(z.unknown()).min(1).max(20),
      role: z.literal("user"),
    })
    .loose(),
  // 各实体在服务端按自己的 schema 校验；不合法时本轮不附带页面上下文。
  pageContext: z.json().nullable().optional(),
});

/** 首次保存新记录后，把新建页的草稿会话转入该记录（ADR-0045）。 */
export const attachSubjectDraftSchema = z.object({ draftId: subjectDraftIdSchema });
