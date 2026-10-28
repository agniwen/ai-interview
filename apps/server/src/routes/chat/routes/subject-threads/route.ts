import { zValidator } from "@hono/zod-validator";
import { createUIMessageStreamResponse } from "ai";
import { createRequestWorkspaceAuthorizer } from "../../../../access/workspace-access-policy";
import { legacyUiMessageToArcMessage } from "../../../../agents/mastra/adapters/arc-message-adapter";
import { factory, jsonValidatorError } from "../../../../factory";
import { captureBackendException } from "../../../../infrastructure/sentry";
import { requirePermission } from "../../../../middlewares/permission";
import {
  archiveActiveSubjectThread,
  attachSubjectDraftThreads,
  claimSubjectThreadRun,
  deleteArchivedSubjectThread,
  ensureActiveSubjectThread,
  isRunStateActive,
  listArchivedSubjectThreads,
  listSubjectThreadMessages,
  loadActiveSubjectThread,
  loadLatestSubjectThreadMessageId,
  loadSubjectThreadById,
  loadSubjectThreadModelHistory,
  loadUserDisplay,
  releaseSubjectThreadRun,
  restoreSubjectThread,
  saveSubjectThreadMessage,
} from "./dao";
import type { SubjectRef, SubjectThreadRow } from "./dao";
import { runSubjectThreadTurn } from "./application/run-subject-thread-turn";
import {
  attachSubjectDraftSchema,
  sendSubjectThreadMessageSchema,
  subjectThreadConversationParamSchema,
  subjectThreadMessagesQuerySchema,
  subjectThreadParamSchema,
} from "./schema";
import { subjectDefinitions } from "./subjects";
import type { SubjectThreadAccess } from "./subjects";
import {
  isSubjectDraftId,
  subjectDraftIdSchema,
  toStoredSubjectDraftId,
} from "@app/db-schema/chat-subject-threads";
import type { ChatSubjectKind } from "@app/db-schema/chat-subject-threads";

const PREVIEW_MESSAGE_LIMIT = 100;

interface RequestActor {
  memberRole: string | null | undefined;
  organizationId: string | undefined;
  userId: string | undefined;
}

type SubjectAccessResult =
  | { error: "forbidden" | "not_found" | "unauthorized" }
  | {
      canDelete: boolean;
      canEdit: boolean;
      /** 草稿会话尚无记录，为 null。 */
      recordId: string | null;
      ref: SubjectRef;
      userId: string;
    };

/**
 * 访问跟随记录而非会话（ADR-0045）：按记录权限与记录存在性判断。新建页的草稿会话只要求创建
 * 权限，并按创建人隔离存储，其他成员无法寻址。
 * Access follows the record (ADR-0045); a new-record draft needs create permission and is stored
 * per creator, so other members cannot address it.
 */
async function resolveSubjectAccess(
  actor: RequestActor,
  params: { kind: ChatSubjectKind; subjectId: string },
  required: Exclude<SubjectThreadAccess, "create">,
): Promise<SubjectAccessResult> {
  if (!(actor.userId && actor.organizationId)) {
    return { error: "unauthorized" };
  }
  const definition = subjectDefinitions[params.kind];
  const authorize = createRequestWorkspaceAuthorizer({
    memberRole: actor.memberRole,
    organizationId: actor.organizationId,
    userId: actor.userId,
  });
  if (isSubjectDraftId(params.subjectId)) {
    const canCreate = await definition.authorize.create(authorize);
    if (!(canCreate && subjectDraftIdSchema.safeParse(params.subjectId).success)) {
      return { error: canCreate ? "not_found" : "forbidden" };
    }
    return {
      canDelete: true,
      canEdit: true,
      recordId: null,
      ref: {
        organizationId: actor.organizationId,
        subjectId: toStoredSubjectDraftId(actor.userId, params.subjectId),
        subjectKind: params.kind,
      },
      userId: actor.userId,
    };
  }
  const [canView, canEdit, canDelete] = await Promise.all([
    definition.authorize.view(authorize),
    definition.authorize.edit(authorize),
    definition.authorize.delete(authorize),
  ]);
  const allowed = { delete: canDelete, edit: canEdit, view: canView }[required];
  if (!(canView && allowed)) {
    return { error: "forbidden" };
  }
  if (!(await definition.exists(actor.organizationId, params.subjectId))) {
    return { error: "not_found" };
  }
  return {
    canDelete,
    canEdit,
    recordId: params.subjectId,
    ref: {
      organizationId: actor.organizationId,
      subjectId: params.subjectId,
      subjectKind: params.kind,
    },
    userId: actor.userId,
  };
}

const accessErrorStatus = { forbidden: 403, not_found: 404, unauthorized: 401 } as const;
const accessErrorMessage = {
  forbidden: "没有访问该会话的权限。",
  not_found: "记录不存在或已删除。",
  unauthorized: "Unauthorized",
} as const;

function serializeThread(thread: SubjectThreadRow) {
  return {
    archivedAt: thread.archivedAt?.toISOString() ?? null,
    createdAt: thread.createdAt.toISOString(),
    createdBy: thread.createdBy,
    id: thread.id,
    title: thread.title,
    updatedAt: thread.updatedAt.toISOString(),
  };
}

async function describeRun(thread: SubjectThreadRow) {
  if (!isRunStateActive(thread.runState)) {
    return null;
  }
  const runner = thread.runState ? await loadUserDisplay(thread.runState.userId) : null;
  return { startedAt: thread.runState?.startedAt ?? null, user: runner };
}

export const subjectThreadsRouter = factory
  .createApp()
  .use("*", requirePermission("chat", "read"))
  .get(
    "/:kind/:subjectId",
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    zValidator("query", subjectThreadMessagesQuerySchema, jsonValidatorError("分页参数无效。")),
    async (c) => {
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        c.req.valid("param"),
        "view",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const permissions = { canDelete: access.canDelete, canEdit: access.canEdit };
      const thread = await loadActiveSubjectThread(access.ref);
      if (!thread) {
        return c.json({ hasMore: false, messages: [], permissions, thread: null }, 200);
      }
      const { limit } = c.req.valid("query");
      const [page, latestMessageId, run] = await Promise.all([
        listSubjectThreadMessages({ conversationId: thread.id, limit }),
        loadLatestSubjectThreadMessageId(thread.id),
        describeRun(thread),
      ]);
      return c.json(
        {
          hasMore: page.hasMore,
          messages: page.messages,
          permissions,
          thread: { ...serializeThread(thread), latestMessageId, run },
        },
        200,
      );
    },
  )
  .get(
    "/:kind/:subjectId/messages",
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    zValidator("query", subjectThreadMessagesQuerySchema, jsonValidatorError("分页参数无效。")),
    async (c) => {
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        c.req.valid("param"),
        "view",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const thread = await loadActiveSubjectThread(access.ref);
      if (!thread) {
        return c.json({ hasMore: false, messages: [] }, 200);
      }
      const { before, limit } = c.req.valid("query");
      const page = await listSubjectThreadMessages({ before, conversationId: thread.id, limit });
      return c.json(page, 200);
    },
  )
  .post(
    "/:kind/:subjectId/messages",
    requirePermission("chat", "create"),
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    zValidator("json", sendSubjectThreadMessageSchema, jsonValidatorError("消息格式无效。")),
    async (c) => {
      const params = c.req.valid("param");
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        params,
        "edit",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const body = c.req.valid("json");
      const definition = subjectDefinitions[params.kind];
      const result = await runSubjectThreadTurn(
        {
          actorUserId: access.userId,
          message: body.message,
          pageContext: body.pageContext ?? null,
          ref: access.ref,
          signal: c.req.raw.signal,
        },
        {
          claimRun: claimSubjectThreadRun,
          createAgent: (pageContext) =>
            definition.createAgent({
              organizationId: access.ref.organizationId,
              pageContext,
              recordId: access.recordId,
            }),
          ensureThread: ensureActiveSubjectThread,
          loadHistory: loadSubjectThreadModelHistory,
          loadThread: loadSubjectThreadById,
          releaseRun: releaseSubjectThreadRun,
          reportError: captureBackendException,
          saveMessage: saveSubjectThreadMessage,
          toArcMessage: legacyUiMessageToArcMessage,
        },
      );
      if (result.kind === "invalid_message") {
        return c.json({ error: "消息不能为空。" }, 400);
      }
      if (result.kind === "busy") {
        const runner = result.runningUserId ? await loadUserDisplay(result.runningUserId) : null;
        return c.json(
          { code: "thread_busy" as const, error: "其他成员正在与助手对话，请稍后再发送。", runner },
          409,
        );
      }
      return createUIMessageStreamResponse({ stream: result.stream });
    },
  )
  .post(
    "/:kind/:subjectId/archive",
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    async (c) => {
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        c.req.valid("param"),
        "edit",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const result = await archiveActiveSubjectThread(access.ref);
      if (result === "busy") {
        return c.json({ error: "助手正在回复，请稍后再开始新对话。" }, 409);
      }
      return c.json({ ok: true }, 200);
    },
  )
  .get(
    "/:kind/:subjectId/history",
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    async (c) => {
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        c.req.valid("param"),
        "view",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const threads = await listArchivedSubjectThreads(access.ref);
      return c.json({ threads: threads.map(serializeThread) }, 200);
    },
  )
  .get(
    "/:kind/:subjectId/history/:conversationId",
    zValidator("param", subjectThreadConversationParamSchema, jsonValidatorError("会话参数无效。")),
    async (c) => {
      const { conversationId, ...params } = c.req.valid("param");
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        params,
        "view",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const thread = await loadSubjectThreadById(access.ref, conversationId);
      if (!thread?.archivedAt) {
        return c.json({ error: "历史会话不存在或已删除。" }, 404);
      }
      const page = await listSubjectThreadMessages({
        conversationId,
        limit: PREVIEW_MESSAGE_LIMIT,
      });
      return c.json({ ...page, thread: serializeThread(thread) }, 200);
    },
  )
  .post(
    "/:kind/:subjectId/history/:conversationId/restore",
    zValidator("param", subjectThreadConversationParamSchema, jsonValidatorError("会话参数无效。")),
    async (c) => {
      const { conversationId, ...params } = c.req.valid("param");
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        params,
        "edit",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const result = await restoreSubjectThread(access.ref, conversationId);
      if (result === "not_found") {
        return c.json({ error: "历史会话不存在或已删除。" }, 404);
      }
      if (result === "busy") {
        return c.json({ error: "助手正在回复，请稍后再恢复。" }, 409);
      }
      return c.json({ ok: true }, 200);
    },
  )
  .delete(
    "/:kind/:subjectId/history/:conversationId",
    zValidator("param", subjectThreadConversationParamSchema, jsonValidatorError("会话参数无效。")),
    async (c) => {
      const { conversationId, ...params } = c.req.valid("param");
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        params,
        "delete",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const result = await deleteArchivedSubjectThread(access.ref, conversationId);
      if (result !== "ok") {
        return c.json({ error: "历史会话不存在或已删除。" }, 404);
      }
      return c.json({ ok: true }, 200);
    },
  )
  .post(
    "/:kind/:subjectId/attach-draft",
    zValidator("param", subjectThreadParamSchema, jsonValidatorError("会话参数无效。")),
    zValidator("json", attachSubjectDraftSchema, jsonValidatorError("草稿会话参数无效。")),
    async (c) => {
      const params = c.req.valid("param");
      if (isSubjectDraftId(params.subjectId)) {
        return c.json({ error: "只能转入已保存的记录。" }, 400);
      }
      const access = await resolveSubjectAccess(
        {
          memberRole: c.var.member?.role,
          organizationId: c.var.activeOrg?.id,
          userId: c.var.user?.id,
        },
        params,
        "edit",
      );
      if ("error" in access) {
        return c.json({ error: accessErrorMessage[access.error] }, accessErrorStatus[access.error]);
      }
      const attached = await attachSubjectDraftThreads({
        draftSubjectId: toStoredSubjectDraftId(access.userId, c.req.valid("json").draftId),
        target: access.ref,
      });
      return c.json({ attached }, 200);
    },
  );
